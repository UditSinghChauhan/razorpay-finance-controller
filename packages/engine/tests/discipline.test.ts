import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The architectural properties `packages/engine` exists to have.
 *
 * These read the package's own source as **text**, from the test process. The
 * engine itself performs no I/O; a test asserting that fact necessarily does.
 * `DECISION_BRIEF.md §L.1` rule 3 and `PREREGISTRATION.md §6.2` AL1 declare the
 * import bans ESLint-enforced; this suite is the second, independent check —
 * a lint rule that stops running is a boundary everyone believes is guarded.
 */

const SRC = join(import.meta.dirname, "..", "src");

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
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
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

describe("the package exists and S0 is not in it", () => {
  it("has source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contains no s0-* module — S0 belongs to packages/domain (spec 1.4.18)", () => {
    // DATA_MODEL.md §22.2 M32. The DECISION_BRIEF tree placed s0-ingest.ts here
    // until v1.4.18 corrected it; this test is what keeps it corrected.
    for (const f of files) expect(f).not.toMatch(/[/\\]s0[-.]/);
  });
});

describe("forbidden imports (DECISION_BRIEF §L.1 rule 3, AL1)", () => {
  const banned: ReadonlyArray<readonly [RegExp, string]> = [
    [/@assay\/oracle|packages[/\\]oracle/, "packages/oracle"],
    [/@assay\/generator|packages[/\\]generator/, "packages/generator"],
    [/untrusted-text|untrusted_text|UntrustedText/, "the quarantined text store"],
    // Stage S0, added when Phase 2 gave it a subpath export. It is a SEPARATE
    // entry rather than a widening of the row above because the specifier
    // `@assay/domain/s0-ingest` contains no "untrusted" substring and would
    // pass that regex — while `RECONCILIATION_SPEC.md §2` gives S0 the output
    // `Observation[]` + `UntrustedText[]`, so importing it reaches the
    // quarantine by another name. This package begins at S1 (spec 1.4.18, M32).
    [/@assay\/domain\/s0-ingest|s0-ingest/, "stage S0"],
  ];

  for (const [re, label] of banned) {
    it(`never imports ${label}`, () => {
      for (const { file, text } of sources) {
        for (const spec of specifiers(text)) {
          expect(`${file} :: ${spec}`).not.toMatch(re);
        }
      }
    });
  }

  it("never names UntrustedText even in a type position", () => {
    // The ban is on the TYPE as much as the value: ARCHITECTURE.md §4 boundary 1
    // says "the deterministic core never reads them", and a type-only import is
    // still an import ESLint's no-restricted-imports rejects.
    for (const { file, text } of sources) {
      expect(`${file}`).toBeTruthy();
      expect(text).not.toMatch(/UntrustedText/);
    }
  });
});

describe("no I/O, no clock, no randomness — ARCHITECTURE §3", () => {
  const forbiddenModules =
    /^(node:)?(fs|fs\/promises|path|http|https|net|dns|child_process|worker_threads|crypto|os|tls|dgram|readline|process)$/;

  it("imports no node builtin", () => {
    for (const { file, text } of sources) {
      for (const spec of specifiers(text)) {
        expect(`${file} :: ${spec}`).toEqual(
          expect.not.stringMatching(/never-matches-sentinel/),
        );
        expect(forbiddenModules.test(spec)).toBe(false);
      }
    }
  });

  it("calls no clock and no random source", () => {
    const banned = [
      /\bDate\s*\.\s*now\b/,
      /\bnew\s+Date\b/,
      /\bMath\s*\.\s*random\b/,
      /\bperformance\s*\.\s*now\b/,
      /\bprocess\s*\.\s*(env|hrtime|argv)\b/,
      /\bfetch\s*\(/,
      /\bcrypto\s*\.\s*getRandomValues\b/,
    ];
    for (const { file, text } of sources) {
      const stripped = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const re of banned) {
        expect(`${file} :: ${re.source}`).toBeTruthy();
        expect(re.test(stripped)).toBe(false);
      }
    }
  });

  it("declares only the dependencies it may have", () => {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {}).sort();
    // `@assay/ledger` joined at S4 for §6's materiality, which runs both
    // allocations through the PURE `journalFor`. DECISION_BRIEF.md §L.2 places
    // ledger Layer B between `engine S1-S3` and `engine S4-S5` precisely so
    // this is available, and calls journal.ts "a pure posting function".
    // No persistence, no write path, no ValidatedDecision -- S5 owns that.
    expect(deps).toEqual(["@assay/domain", "@assay/ledger", "@assay/money"]);
  });
});

describe("the ValidatedDecision boundary (ARCHITECTURE §4 boundary 3)", () => {
  /** `x as unknown as T` / `x as T` widenings, comments stripped. */
  function widenings(text: string): string[] {
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    return [...stripped.matchAll(/as\s+unknown\s+as\s+ValidatedDecision/g)].map(
      (m) => m[0],
    );
  }

  it("contains exactly ONE widening to ValidatedDecision, and it is in s5-validate", () => {
    // DECISION_BRIEF.md §L.1 rule 4 permits precisely one, and ARCHITECTURE.md
    // §4 boundary 3 explains why it cannot be a runtime property. A second one
    // anywhere would make "only S5 may construct" a convention again.
    const found = sources.flatMap(({ file, text }) =>
      widenings(text).map(() => file),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/s5-validate\.ts$/);
  });

  it("exports no constructor, factory or minting helper for it", () => {
    for (const { file, text } of sources) {
      expect(`${file}`).toBeTruthy();
      expect(text).not.toMatch(/export\s+(function|const)\s+\w*(mint|create|make|as)ValidatedDecision/);
    }
  });

  it("adds no persistence or ledger write path", () => {
    const banned =
      /\b(writeFile|appendFile|createWriteStream|openSync|db\.|sqlite|INSERT\s+INTO|appendEvent|commit\()/i;
    for (const { file, text } of sources) {
      const stripped = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(`${file}`).toBeTruthy();
      expect(banned.test(stripped)).toBe(false);
    }
  });

  it("imports no close gate and no chain mutator", () => {
    for (const { file, text } of sources) {
      for (const spec of specifiers(text)) {
        expect(`${file} :: ${spec}`).not.toMatch(/close-gate|close\.js|hash-chain/);
      }
    }
  });
});

describe("purity is observable, not merely asserted", () => {
  it("returns equal results for equal inputs across repeated calls", async () => {
    const { anchor } = await import("@assay/engine");
    const { settlement, reconLine, bankLine } = await import("./fixtures.js");
    const input = [settlement(1), reconLine(1), bankLine(2)];
    const a = anchor(input);
    const b = anchor(input);
    expect(b).toEqual(a);
  });

  it("does not mutate its argument", async () => {
    const { anchor } = await import("@assay/engine");
    const { settlement, reconLine } = await import("./fixtures.js");
    const input = [settlement(1), reconLine(1)];
    const snapshot = structuredClone(input);
    anchor(input);
    expect(input).toEqual(snapshot);
  });

  it("freezes what it hands back", async () => {
    const { anchor } = await import("@assay/engine");
    const { settlement, reconLine } = await import("./fixtures.js");
    const r = anchor([settlement(1), reconLine(1)]);
    expect(Object.isFrozen(r.links)).toBe(true);
    expect(Object.isFrozen(r.rejections)).toBe(true);
    expect(Object.isFrozen(r.anchored_obs_ids)).toBe(true);
    expect(Object.isFrozen(r.unanchored_member_obs_ids)).toBe(true);
  });
});
