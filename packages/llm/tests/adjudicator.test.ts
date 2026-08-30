import { describe, expect, it } from "vitest";

import { adjudicate, hasGroundingRule } from "../src/adjudicator.js";
import type { InvokeRequest, InvokeResult, LlmProvider } from "../src/provider.js";
import { offlineProvider } from "../src/providers/offline.js";
import { ReplayCacheMissError, replayProvider } from "../src/providers/replay.js";
import { R1OutputSchema, groundR1, type R1Output } from "../src/roles/r1.js";
import { RUN, NARRATION, r1Request, r2Request } from "./fixtures.js";

/**
 * Trust boundary 2 assembled, plus `ARCHITECTURE.md §12`'s failure table.
 */

/** A provider that returns whatever a test hands it, or throws. */
class StubProvider implements LlmProvider {
  readonly id = "anthropic" as const;
  readonly modelId = "stub-model";
  readonly requiresNetwork = true;
  readonly meteredCost = true;
  calls = 0;

  constructor(
    private readonly script: readonly (unknown | Error)[],
  ) {}

  invoke<T>(req: InvokeRequest<T>): Promise<InvokeResult<T>> {
    // Deliberately ignores `req.schema`: this stub models a provider that does
    // NOT verify its own output, which is what the boundary must survive.
    void req;
    const step = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls += 1;
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve({
      value: step as T,
      meta: {
        provider: this.id,
        model_id: this.modelId,
        requires_network: true,
        cache_key: "stub-key",
        cache_hit: false,
        raw_response_hash: "stub-hash",
        input_tokens: 10,
        output_tokens: 5,
        latency_ms: 42,
        failure: null,
      },
    });
  }
}

const groundedR1: R1Output = R1OutputSchema.parse({
  utr_candidates: ["1568176960vxp0rj"],
  counterparty_hint: null,
  reference_hints: [],
});

function r1Options(over: Record<string, unknown> = {}) {
  return {
    runId: RUN,
    request: r1Request() as InvokeRequest<R1Output>,
    grounding: (v: R1Output) => groundR1(v, NARRATION),
    ...over,
  };
}

describe("the happy path", () => {
  it("accepts a response that passes all three checks and records one call", async () => {
    const provider = new StubProvider([groundedR1]);
    const result = await adjudicate(provider, r1Options());
    expect(result.value).toEqual(groundedR1);
    expect(result.acceptedFrom).toBe("anthropic");
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]?.outcome).toBe("accepted");
    expect(result.calls[0]?.role).toBe("R1_parse_narration");
    expect(result.calls[0]?.run_id).toBe(RUN);
  });

  it("records provider provenance on every call, including offline (§19)", async () => {
    const result = await adjudicate(offlineProvider(), r1Options());
    expect(result.calls[0]?.provider).toBe("offline");
    expect(result.calls[0]?.model_id).toBe("rules-v1");
    expect(result.calls[0]?.requires_network).toBe(false);
    expect(result.calls[0]?.input_tokens).toBe(0);
  });

  it("emits deterministic llm_call_ids — two runs agree (metric 23)", async () => {
    const a = await adjudicate(offlineProvider(), r1Options());
    const b = await adjudicate(offlineProvider(), r1Options());
    expect(a.calls.map((c) => c.llm_call_id)).toEqual(b.calls.map((c) => c.llm_call_id));
  });
});

describe("check 2 — a hallucinated id discards the response (THREAT_MODEL §T3)", () => {
  it("counts the violation, discards, and falls back to offline", async () => {
    const forged = {
      exception_class: "E05_AMOUNT_MISMATCH",
      evidence_obs_ids: ["pay_XXXXXXXXXXXXXX"],
      analyst_question: "Which side is authoritative?",
    };
    const provider = new StubProvider([forged]);
    const result = await adjudicate(provider, {
      runId: RUN,
      request: r2Request() as InvokeRequest<unknown>,
    });
    const rejected = result.calls.filter((c) => c.outcome === "rejected_allowlist");
    expect(rejected).toHaveLength(2); // the attempt and its one retry
    expect(rejected[0]?.allowlist_violations).toEqual(["pay_XXXXXXXXXXXXXX"]);
    expect(result.acceptedFrom).toBe("offline");
    expect(result.value).not.toBeNull();
  });
});

describe("check 3 — grounding discards an ungrounded extraction", () => {
  it("records the ungrounded token and falls back", async () => {
    const forged = R1OutputSchema.parse({
      utr_candidates: ["RZPX9999"],
      counterparty_hint: null,
      reference_hints: [],
    });
    const provider = new StubProvider([forged]);
    const result = await adjudicate(provider, r1Options());
    const rejected = result.calls.filter((c) => c.outcome === "rejected_grounding");
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected[0]?.grounding_violations).toEqual(["RZPX9999"]);
    expect(result.acceptedFrom).toBe("offline");
  });

  it("only R1 and R4 have a grounding rule at all (§4 boundary 2)", () => {
    expect(hasGroundingRule("R1")).toBe(true);
    expect(hasGroundingRule("R4")).toBe(true);
    expect(hasGroundingRule("R2")).toBe(false);
    expect(hasGroundingRule("R3")).toBe(false);
  });
});

describe("ARCHITECTURE §12 — failure handling", () => {
  it("provider unreachable: retries with backoff, then falls back, and the run completes", async () => {
    const slept: number[] = [];
    const provider = new StubProvider([new Error("ECONNRESET"), new Error("ECONNRESET")]);
    const result = await adjudicate(provider, {
      ...r1Options(),
      sleep: (ms: number) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    expect(provider.calls).toBe(2); // initial attempt + one retry
    expect(slept).toEqual([250]); // backoff applied before the retry
    expect(result.acceptedFrom).toBe("offline");
    expect(result.value).not.toBeNull();
  });

  it("recovers without a fallback when the retry succeeds", async () => {
    const provider = new StubProvider([new Error("429"), groundedR1]);
    const result = await adjudicate(provider, r1Options());
    expect(result.acceptedFrom).toBe("anthropic");
    expect(result.calls).toHaveLength(2);
  });

  it("invalid schema: discards, retries once, then falls back — and counts each", async () => {
    const provider = new StubProvider([{ wrong: "shape" }]);
    const result = await adjudicate(provider, r1Options());
    const rejected = result.calls.filter((c) => c.outcome === "rejected_schema");
    expect(rejected).toHaveLength(2); // the attempt and its one retry
    expect(rejected.every((c) => !c.schema_valid)).toBe(true);
    expect(result.acceptedFrom).toBe("offline");
    expect(result.value).not.toBeNull();
  });

  it("a provider that skips its own schema check cannot bypass boundary 2", async () => {
    // §4: the response is "treated as adversarial". A provider is an
    // implementation of an interface, so the boundary must re-verify rather
    // than trust that the provider verified. Without the adjudicator's own
    // parse this shape reaches the grounding rule and crashes it.
    const hostile = new StubProvider([{ utr_candidates: "not-an-array" }]);
    const result = await adjudicate(hostile, r1Options());
    expect(result.calls.every((c) => c.outcome !== "accepted" || c.provider === "offline")).toBe(
      true,
    );
    expect(result.acceptedFrom).toBe("offline");
  });

  it("never returns a value that failed any check", async () => {
    const forged = { utr_candidates: ["RZPX9999"], counterparty_hint: null, reference_hints: [] };
    const result = await adjudicate(new StubProvider([forged]), {
      ...r1Options(),
      fallback: offlineProvider(),
    });
    if (result.value !== null) {
      expect(groundR1(result.value, NARRATION).ok).toBe(true);
    }
  });

  it("a provider REPORTING unavailability (rather than throwing) also falls back", async () => {
    // §6.5's `invoke` may report a failure instead of throwing; a network
    // provider that has exhausted its own retries would. The declared
    // `UNAVAILABLE` variant is reachable that way, so it is exercised here
    // rather than left as a union member nothing produces.
    const reporting: LlmProvider = {
      id: "anthropic",
      modelId: "stub-model",
      requiresNetwork: true,
      meteredCost: true,
      invoke: () =>
        Promise.resolve({
          value: null,
          meta: {
            provider: "anthropic" as const,
            model_id: "stub-model",
            requires_network: true,
            cache_key: "k",
            cache_hit: false,
            raw_response_hash: "",
            input_tokens: 0,
            output_tokens: 0,
            latency_ms: 0,
            failure: "UNAVAILABLE" as const,
          },
        }),
    };
    const result = await adjudicate(reporting, r1Options());
    expect(result.calls.filter((c) => c.provider === "anthropic")).toHaveLength(2);
    expect(result.calls.every((c) => c.provider !== "anthropic" || !c.schema_valid)).toBe(true);
    expect(result.acceptedFrom).toBe("offline");
    expect(result.value).not.toBeNull();
  });

  it("a strict-replay cache miss is NOT unavailability — it propagates", async () => {
    const provider = replayProvider({ cache: new Map() });
    await expect(
      adjudicate(provider, r1Options()),
    ).rejects.toThrow(ReplayCacheMissError);
  });

  it("does not retry the offline fallback against itself", async () => {
    const result = await adjudicate(offlineProvider(), {
      runId: RUN,
      request: { ...r1Request(), role: "R3" } as InvokeRequest<unknown>,
    });
    expect(result.value).toBeNull();
    expect(result.acceptedFrom).toBeNull();
    // Two attempts (initial + retry), and no third against a fallback that is
    // the same provider.
    expect(result.calls).toHaveLength(2);
  });
});

describe("the LlmCall record (DATA_MODEL §19)", () => {
  it("carries every field §19 declares", async () => {
    const result = await adjudicate(new StubProvider([groundedR1]), r1Options());
    const call = result.calls[0];
    expect(call).toBeDefined();
    expect(Object.keys(call ?? {}).sort()).toEqual(
      [
        "allowlist_violations",
        "cache_hit",
        "cache_key",
        "grounding_violations",
        "input_hash",
        "input_tokens",
        "llm_call_id",
        "latency_ms",
        "model_id",
        "outcome",
        "output_tokens",
        "provider",
        "raw_response_hash",
        "requires_network",
        "role",
        "run_id",
        "schema_valid",
        "system_prompt_hash",
        "system_prompt_id",
      ].sort(),
    );
  });

  it("stores prompt HASHES, never prompt text (THREAT_MODEL §T11)", async () => {
    const result = await adjudicate(offlineProvider(), r1Options());
    const call = result.calls[0];
    expect(call?.system_prompt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(call?.input_hash).toMatch(/^[0-9a-f]{64}$/);
    // The narration itself never appears in the record.
    expect(JSON.stringify(call)).not.toContain("RAZORPAY");
  });
});
