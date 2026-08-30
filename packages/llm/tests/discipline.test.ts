import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PROVIDER_DESCRIPTORS, ROLE_IDS, IMPLEMENTED_ROLE_IDS } from "../src/provider.js";

/**
 * The architectural properties `packages/llm` exists to have.
 *
 * Read as **text**, from the test process, for the reason the engine's
 * equivalent suite gives: `DECISION_BRIEF.md §L.1` declares these boundaries
 * ESLint-enforced, and a lint rule that stops running is a boundary everyone
 * believes is guarded. This is the second, independent check.
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

/** Import/require specifiers, ignoring anything inside a comment. */
function specifiers(text: string): string[] {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of stripped.matchAll(re)) if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

/** Source text with comments removed, for "does the CODE do X" assertions. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("the package exists and holds what §K places here", () => {
  it("has source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("§K's module layout: provider, providers/, roles/, verify/", () => {
    const rel = files.map((f) => f.slice(SRC.length + 1).replaceAll("\\", "/"));
    expect(rel).toContain("provider.ts");
    expect(rel).toContain("providers/offline.ts");
    expect(rel).toContain("providers/replay.ts");
    expect(rel).toContain("roles/r1.ts");
    expect(rel).toContain("roles/r2.ts");
    expect(rel).toContain("verify/schema.ts");
    expect(rel).toContain("verify/allowlist.ts");
    expect(rel).toContain("verify/grounding.ts");
  });
});

describe("the --llm=offline no-network guarantee (§6.5, §L.1 rule 10)", () => {
  const NETWORK = [
    "http", "https", "net", "tls", "dgram", "http2",
    "node:http", "node:https", "node:net", "node:tls", "node:dgram", "node:http2",
    "undici", "node-fetch", "axios", "got", "ws",
  ];

  it("imports no network transport, statically or dynamically", () => {
    for (const { file, text } of sources) {
      for (const spec of specifiers(text)) {
        expect(NETWORK, `${file} imports ${spec}`).not.toContain(spec);
      }
    }
  });

  it("calls no global fetch, XMLHttpRequest, WebSocket or navigator", () => {
    for (const { file, text } of sources) {
      const body = code(text);
      for (const global of ["fetch(", "XMLHttpRequest", "WebSocket", "navigator."]) {
        expect(body.includes(global), `${file} references ${global}`).toBe(false);
      }
    }
  });

  it("reads no environment variable — T0-11 runs from a clean checkout with no API key", () => {
    for (const { file, text } of sources) {
      expect(code(text).includes("process.env"), `${file} reads process.env`).toBe(false);
    }
  });

  it("performs no filesystem I/O — the replay cache is handed in already loaded", () => {
    for (const { file, text } of sources) {
      for (const spec of specifiers(text)) {
        expect(["fs", "node:fs", "node:fs/promises", "node:path", "path"], `${file}`).not.toContain(
          spec,
        );
      }
    }
  });
});

describe("determinism — the two built providers are §6.5's 'fully deterministic'", () => {
  it("reads no clock and no random source", () => {
    for (const { file, text } of sources) {
      const body = code(text);
      for (const nondeterminism of ["Date.now", "new Date", "Math.random", "performance.now"]) {
        expect(body.includes(nondeterminism), `${file} uses ${nondeterminism}`).toBe(false);
      }
    }
  });

  it("uses only node:crypto among builtins, for §19's stated sha256", () => {
    const builtins = sources
      .flatMap(({ text }) => specifiers(text))
      .filter((s) => s.startsWith("node:"));
    expect([...new Set(builtins)]).toEqual(["node:crypto"]);
  });
});

describe("declared package boundaries", () => {
  it("declares only the dependencies it may have", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      "@assay/domain",
      "@assay/ledger",
      "zod",
    ]);
  });

  it("imports no engine, generator or oracle — this package is not on the decision path", () => {
    // §L.1 rule 3 does not name `packages/llm`, and this is not that rule. It is
    // the §1 thesis: "The model may propose. Only deterministic code may
    // commit." A package that could reach the engine could reach S5.
    for (const { file, text } of sources) {
      for (const spec of specifiers(text)) {
        expect(
          ["@assay/engine", "@assay/generator", "@assay/oracle"],
          `${file} imports ${spec}`,
        ).not.toContain(spec);
      }
    }
  });

  it("cannot construct a ValidatedDecision (§6 'roles the model is explicitly forbidden')", () => {
    for (const { file, text } of sources) {
      expect(code(text).includes("ValidatedDecision"), `${file} names ValidatedDecision`).toBe(
        false,
      );
    }
  });

  it("imports @assay/money nowhere — the model expresses no monetary amount", () => {
    for (const { text } of sources) {
      expect(specifiers(text)).not.toContain("@assay/money");
    }
  });
});

describe("Phase 8 scope is declared honestly, not stubbed", () => {
  it("all four roles are declared; only R1 and R2 are implemented", () => {
    expect([...ROLE_IDS]).toEqual(["R1", "R2", "R3", "R4"]);
    expect([...IMPLEMENTED_ROLE_IDS]).toEqual(["R1", "R2"]);
  });

  it("no R3 module, no probe loop, no probe executor exists here", () => {
    const rel = files.map((f) => f.slice(SRC.length + 1).replaceAll("\\", "/"));
    expect(rel).not.toContain("roles/r3.ts");
    expect(rel).not.toContain("roles/r4.ts");
    for (const f of rel) expect(f).not.toMatch(/probe|executor/i);
  });

  it("no source file implements a probe enum or a probe call", () => {
    // RECONCILIATION_SPEC §6.2 has R3 propose and "deterministic code execute
    // it and re-run the solve". Neither actor exists at Phase 8, and the
    // probe-execution owner is an open governance question — so this package
    // must not quietly become the answer.
    for (const { file, text } of sources) {
      const body = code(text);
      for (const probe of [
        "fetch_settlement_recon",
        "fetch_order",
        "fetch_payment",
        "fetch_refund",
        "widen_temporal_window",
        "PROBE_KINDS",
        "ProbeResultDetail",
        "P_MAX",
      ]) {
        expect(body.includes(probe), `${file} references ${probe}`).toBe(false);
      }
    }
  });

  it("the two metered providers are declared and NOT built", () => {
    const unbuilt = PROVIDER_DESCRIPTORS.filter((d) => !d.built).map((d) => d.id);
    expect(unbuilt).toEqual(["anthropic", "openai-compatible"]);
    const rel = files.map((f) => f.slice(SRC.length + 1).replaceAll("\\", "/"));
    expect(rel).not.toContain("providers/anthropic.ts");
    expect(rel).not.toContain("providers/openai-compatible.ts");
  });

  it("no consumer AI subscription is referenced (§L.4, §T11)", () => {
    for (const { file, text } of sources) {
      const body = code(text).toLowerCase();
      for (const consumer of ["claude.ai", "chatgpt.com", "claude pro", "chatgpt go"]) {
        expect(body.includes(consumer), `${file} references ${consumer}`).toBe(false);
      }
    }
  });
});

describe("the §L.1 rule 2 lint is wired, not merely intended", () => {
  it("eslint.config.js scopes a rule-2 block to packages/llm", () => {
    const config = readFileSync(join(ROOT, "..", "..", "eslint.config.js"), "utf8");
    expect(config).toContain('files: ["packages/llm/src/**"]');
    expect(config).toContain("§L.1 rule 2");
    // Scoped to src/, so tests can still construct the forbidden thing in order
    // to assert it is rejected.
    expect(config).not.toContain('files: ["packages/llm/**"]');
    // The deferred note that said this lint was not yet written must be gone.
    expect(config).not.toContain("it lands with\n  //     packages/llm (Phase 8)");
  });
});
