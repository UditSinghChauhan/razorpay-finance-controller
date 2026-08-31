import { callHashes } from "../cache-key.js";
import {
  type InvokeRequest,
  type InvokeResult,
  type LlmProvider,
  type LlmCallMeta,
} from "../provider.js";
import { offlineR1 } from "../roles/r1.js";
import { offlineR2 } from "../roles/r2.js";
import { offlineR3 } from "../roles/r3.js";
import { checkSchema } from "../verify/schema.js";

/**
 * The `offline` provider (`ARCHITECTURE.md §6.5`).
 *
 * *"Rule-based implementation of all four roles: regex battery (R1),
 * decision-tree classifier (R2), static probe priority list (R3), templated
 * explainer (R4). **The CI default and the guaranteed demo path.**"*
 *
 * **Three hard rules from `§6.5` this implementation exists to satisfy:**
 *
 * - *"The full pipeline must pass every acceptance test under `--llm=offline`."*
 *   (`§L.1` rule 10.)
 * - *"The `offline` provider is the same component as ablation `A3-NOLLM`. It is
 *   built properly, not as a stub — a sabotaged offline path would both break
 *   the demo guarantee and invalidate the ablation."*
 * - Network: **none**. Cost: **zero**. Determinism: **full**.
 *
 * **`R3` is implemented from spec 1.4.25; `R4` is not, and this provider says so
 * rather than returning a plausible default.** `§H` puts `R3` at tier H1 and `R4`
 * at tier H2.
 *
 * Phase 8 refused to stub `R3` on the grounds that it *"would be exactly the
 * static probe priority list that `A3-NOLLM` is measured **as**, so inventing one
 * here would silently create the baseline the H1 comparison is supposed to build
 * deliberately."* **That objection is answered rather than overruled.** The list
 * is no longer invented here: `PREREGISTRATION.md §7` states it, `AL3` binds it
 * and `DECISION_BRIEF.md §L.1` rule 12 lists it, so `§L.4` forbids revising it
 * from a result. `roles/r3.ts` executes a pre-registered parameter; it does not
 * choose one.
 */
export class OfflineProvider implements LlmProvider {
  readonly id = "offline" as const;

  /** `§19`: *"`model_id` ... `"rules-v1"` when `provider === "offline"`"*. */
  readonly modelId = "rules-v1";
  readonly requiresNetwork = false;
  readonly meteredCost = false;

  async invoke<T>(req: InvokeRequest<T>): Promise<InvokeResult<T>> {
    const hashes = callHashes({
      provider: this.id,
      modelId: this.modelId,
      systemPromptId: req.systemPromptId,
      input: req.input,
    });

    const base = {
      provider: this.id,
      model_id: this.modelId,
      requires_network: false,
      cache_key: hashes.cache_key,
      // A rule-based provider never consults a response cache: it recomputes.
      cache_hit: false,
      // Zero cost is a property of this provider, not a placeholder (§19: "0 for
      // offline"). Latency is likewise not measured here — a wall-clock read
      // inside a provider whose whole claim is determinism would make two runs
      // over identical inputs differ (metric 23).
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: 0,
    } as const;

    let raw: unknown;
    if (req.role === "R1" && req.input.role === "R1") {
      raw = offlineR1(req.input);
    } else if (req.role === "R2" && req.input.role === "R2") {
      raw = offlineR2(req.input, req.idAllowlist);
    } else if (req.role === "R3" && req.input.role === "R3") {
      // PREREGISTRATION.md §7's frozen A3-NOLLM policy, executed. Nothing here
      // is chosen at the keyboard; see roles/r3.ts.
      raw = offlineR3(req.input);
    } else {
      const meta: LlmCallMeta = {
        ...base,
        raw_response_hash: "",
        failure: req.role === "R4" ? "ROLE_NOT_IMPLEMENTED" : "SCHEMA_REJECT",
      };
      return { value: null, meta };
    }

    const checked = checkSchema(req.schema, raw);
    const meta: LlmCallMeta = {
      ...base,
      raw_response_hash: hashes.input_hash,
      failure: checked.ok ? null : "SCHEMA_REJECT",
    };
    return { value: checked.ok ? checked.value : null, meta };
  }
}

/** The `offline` provider. Needs no configuration and no credential. */
export function offlineProvider(): LlmProvider {
  return new OfflineProvider();
}
