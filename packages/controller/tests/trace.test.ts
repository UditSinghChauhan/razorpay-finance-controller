import { describe, expect, it } from "vitest";

import { digest, traceId } from "../src/trace.js";
import type { ControllerStep } from "../src/trace.js";

describe("digest — sha256(canonical_json(value))", () => {
  it("is a 64-character lowercase hex string", () => {
    expect(digest({ a: 1, b: [1, 2, 3] })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable under key order — canonical, not literal, JSON", () => {
    expect(digest({ a: 1, b: 2 })).toBe(digest({ b: 2, a: 1 }));
  });

  it("differs for genuinely different values", () => {
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
  });
});

describe("traceId — content-addressed, not random", () => {
  const step = (n: number): ControllerStep => ({
    step_no: n,
    state: "INIT",
    rule_fired: "SEQ_VERIFY",
    tool: null,
    tool_input_hash: null,
    observation_digest: null,
    observation_summary: "x",
    next_state: "OBSERVE_CLOSE",
    caused_events: [],
    llm: null,
  });

  it("is identical for identical (run_id, steps)", () => {
    const a = traceId("run_x", [step(1), step(2)]);
    const b = traceId("run_x", [step(1), step(2)]);
    expect(a).toBe(b);
  });

  it("differs when the run id differs", () => {
    expect(traceId("run_x", [step(1)])).not.toBe(traceId("run_y", [step(1)]));
  });

  it("differs when the step sequence differs", () => {
    expect(traceId("run_x", [step(1)])).not.toBe(traceId("run_x", [step(1), step(2)]));
  });
});
