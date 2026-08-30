import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The architectural properties `packages/probe` exists to have (spec 1.4.23).
 *
 * Read as text, the way `packages/engine`'s and `packages/llm`'s equivalents are:
 * `eslint.config.js` declares these boundaries, and a lint rule that stops
 * running is a boundary everyone believes is guarded.
 */

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const files = sourceFiles(SRC);
const sources = files.map((f) => ({ file: f, text: readFileSync(f, "utf8") }));

function specifiers(text: string): string[] {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const re of [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g]) {
    for (const m of stripped.matchAll(re)) if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the lint boundary is scoped to src, and this suite is why", () => {
  it("eslint.config.js constrains packages/probe/src, not the tests", () => {
    const config = readFileSync(join(ROOT, "..", "..", "eslint.config.js"), "utf8");
    expect(config).toContain('files: ["packages/probe/src/**"]');
    expect(config).not.toContain('files: ["packages/probe/**"]');
  });
});

describe("§K's module layout", () => {
  it("holds call.ts, loop.ts and event.ts and nothing else", () => {
    expect(files.map((f) => f.slice(SRC.length + 1).replaceAll("\\", "/")).sort()).toEqual([
      "call.ts",
      "event.ts",
      "index.ts",
      "loop.ts",
    ]);
  });
});

describe("purity — the property that makes §L.2's position available", () => {
  it("imports no filesystem, network or node builtin at all", () => {
    for (const { file, text } of sources) {
      for (const spec of specifiers(text)) {
        expect(spec.startsWith("node:"), `${file} imports ${spec}`).toBe(false);
        expect(
          ["fs", "path", "http", "https", "net", "tls", "undici", "axios"],
          `${file} imports ${spec}`,
        ).not.toContain(spec);
      }
    }
  });

  it("does NOT import packages/llm — §L.2 places probe BEFORE it", () => {
    // The loop consumes an R3 proposal as a VALUE. An llm import would make the
    // build order cyclic and would move a control into the package that calls
    // the model (ARCHITECTURE.md §4 boundary 2).
    for (const { file, text } of sources) {
      for (const spec of specifiers(text)) {
        expect(spec, `${file}`).not.toMatch(/@assay\/llm/);
      }
    }
  });

  it("imports no generator, oracle or quarantined text", () => {
    for (const { file, text } of sources) {
      for (const spec of specifiers(text)) {
        expect(
          ["@assay/generator", "@assay/oracle", "@assay/domain/untrusted-text"],
          `${file} imports ${spec}`,
        ).not.toContain(spec);
      }
    }
  });

  it("reads no clock and no random source (DATA_MODEL §16, metric 23)", () => {
    for (const { file, text } of sources) {
      const body = code(text);
      for (const nd of ["Date.now", "new Date", "Math.random", "performance.now", "process.env"]) {
        expect(body.includes(nd), `${file} uses ${nd}`).toBe(false);
      }
    }
  });

  it("declares only the dependencies it may have", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      "@assay/domain",
      "@assay/engine",
      "@assay/ledger",
    ]);
  });
});

describe("§T7's controls are here and are not bypassable", () => {
  it("no URL, host, endpoint or socket appears anywhere in the package", () => {
    for (const { file, text } of sources) {
      const body = code(text);
      for (const t of ["http://", "https://", "URL(", "fetch(", "Socket", "hostname"]) {
        expect(body.includes(t), `${file} references ${t}`).toBe(false);
      }
    }
  });

  it("exports exactly one function that yields a ValidatedProbeCall", () => {
    const call = readFileSync(join(SRC, "call.ts"), "utf8");
    const producers = [...code(call).matchAll(/as ValidatedProbeCall/g)];
    expect(producers).toHaveLength(1);
  });

  it("the brand symbol is NOT exported, so the type cannot be forged", () => {
    const call = readFileSync(join(SRC, "call.ts"), "utf8");
    expect(call).toContain("declare const validatedProbeCall: unique symbol");
    expect(call).not.toMatch(/export\s+(const|declare const)\s+validatedProbeCall/);
  });

  it("P_MAX is read from packages/engine, never re-spelled", () => {
    const loop = readFileSync(join(SRC, "loop.ts"), "utf8");
    expect(loop).toContain('from "@assay/engine"');
    expect(code(loop)).not.toMatch(/P_MAX\s*=\s*[0-9]/);
  });
});

describe("the §6 seam is surfaced, not replaced", () => {
  it("no new certificate reason is invented anywhere in the package", () => {
    for (const { file, text } of sources) {
      const body = code(text);
      // The three frozen reasons may be referenced; a fourth may not be minted.
      expect(body, `${file}`).not.toMatch(/NO_USEFUL_PROBE_[A-Z_]+|PROBE_[A-Z_]*_UNRESOLVED/);
    }
  });

  it("the undecided seam is passed through by name", () => {
    const loop = readFileSync(join(SRC, "loop.ts"), "utf8");
    expect(loop).toContain("A2_MIDDLE_CASE_UNSPECIFIED");
    expect(loop).toContain("certificate_reason");
  });
});
