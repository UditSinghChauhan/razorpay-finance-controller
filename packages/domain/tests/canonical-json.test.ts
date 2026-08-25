import { describe, expect, it } from "vitest";

import { canonicalJson } from "@assay/domain";

describe("canonicalJson — DATA_MODEL.md §0 rule 5", () => {
  it("sorts object keys lexicographically regardless of insertion order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ z: 1, A: 2, a: 3, "0": 4 })).toBe(
      '{"0":4,"A":2,"a":3,"z":1}',
    );
  });

  it("sorts nested keys too", () => {
    expect(canonicalJson({ outer: { b: 1, a: 2 } })).toBe(
      '{"outer":{"a":2,"b":1}}',
    );
  });

  it("emits no structural whitespace", () => {
    const out = canonicalJson({ a: [1, 2], b: { c: "x y" } });
    expect(out).toBe('{"a":[1,2],"b":{"c":"x y"}}');
    expect(out.replace(/"[^"]*"/g, "")).not.toMatch(/\s/);
  });

  it("preserves array order, which is semantic", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJson([1, 2, 3])).toBe("[1,2,3]");
  });

  it("writes integers in plain decimal, never exponent notation", () => {
    expect(canonicalJson(0)).toBe("0");
    expect(canonicalJson(-1)).toBe("-1");
    expect(canonicalJson(Number.MAX_SAFE_INTEGER)).toBe("9007199254740991");
    expect(canonicalJson(-Number.MAX_SAFE_INTEGER)).toBe("-9007199254740991");
    expect(canonicalJson(1_000_000_000_000_000)).toBe("1000000000000000");
    expect(canonicalJson(Number.MAX_SAFE_INTEGER)).not.toMatch(/e/i);
  });

  it("normalizes negative zero", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson({ a: -0 })).toBe('{"a":0}');
  });

  it("serializes null and booleans", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson({ a: null, b: true, c: false })).toBe(
      '{"a":null,"b":true,"c":false}',
    );
  });

  it("escapes strings deterministically", () => {
    expect(canonicalJson('a"b')).toBe('"a\\"b"');
    expect(canonicalJson("a\nb")).toBe('"a\\nb"');
    expect(canonicalJson("a\tb")).toBe('"a\\tb"');
    // Control characters must be escaped, not emitted raw, or the output is
    // not valid JSON and its bytes depend on the transport.
    expect(canonicalJson(String.fromCharCode(0))).toBe('"\\u0000"');
    expect(canonicalJson(String.fromCharCode(31))).toBe('"\\u001f"');
    expect(canonicalJson("₹")).toBe('"₹"');
  });

  it("handles empty structures", () => {
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });
});

describe("canonicalJson rejects what cannot be hashed reproducibly", () => {
  it("rejects non-integer numbers", () => {
    expect(() => canonicalJson(1.5)).toThrow(TypeError);
    expect(() => canonicalJson(0.1)).toThrow(TypeError);
    expect(() => canonicalJson({ a: 1.000_000_1 })).toThrow(TypeError);
  });

  it("rejects NaN and the infinities rather than emitting null", () => {
    // JSON.stringify turns all three into `null`, silently.
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => canonicalJson(Number.NEGATIVE_INFINITY)).toThrow(TypeError);
  });

  it("rejects integers outside the safe range", () => {
    expect(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
    expect(() => canonicalJson(1e21)).toThrow(TypeError);
  });

  it("rejects undefined rather than dropping the property", () => {
    // JSON.stringify({a: undefined}) === "{}" — a field would vanish from a
    // hashed body with nothing raising.
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(() => canonicalJson({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalJson([undefined])).toThrow(TypeError);
  });

  it("rejects values that serialize lossily or unstably", () => {
    expect(() => canonicalJson(new Date(0))).toThrow(TypeError);
    expect(() => canonicalJson(new Map())).toThrow(TypeError);
    expect(() => canonicalJson(new Set())).toThrow(TypeError);
    expect(() => canonicalJson(() => 1)).toThrow(TypeError);
    expect(() => canonicalJson(Symbol("x"))).toThrow(TypeError);
    expect(() => canonicalJson(1n)).toThrow(TypeError);
    class Thing {}
    expect(() => canonicalJson(new Thing())).toThrow(TypeError);
  });

  it("rejects cycles instead of overflowing the stack", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/circular/i);
  });

  it("names the path to the offending value", () => {
    expect(() => canonicalJson({ outer: { inner: [0, 1.5] } })).toThrow(
      /\$\.outer\.inner\[1\]/,
    );
  });

  it("ignores symbol keys, as JSON does", () => {
    const withSymbol = { a: 1, [Symbol("hidden")]: 2 };
    expect(canonicalJson(withSymbol)).toBe('{"a":1}');
  });
});
