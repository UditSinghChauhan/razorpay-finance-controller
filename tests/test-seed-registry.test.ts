import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The declared test-seed registry, kept complete (Work Order 3b, 1.3; bench-v2
 * seal gate G-F, `docs/BENCH_V2_PREREGISTRATION.md §7`).
 *
 * bench-v2's predictions were informed by test seeds (7001–7020), which is
 * acceptable only if the corpus shares none of them. The seal checks corpus
 * seeds against `scripts/test-seed-registry.json`; THIS suite is what makes the
 * registry trustworthy: it extracts every seed a test file spells, by the
 * patterns below, and fails if one lies outside every registered range.
 *
 * **The patterns, stated so the residual is visible.** A seed is extracted from:
 *   1. `SEED… = n` / `seed = n` / `seed: n` (decimal, `_`-grouped or `0x…n`);
 *   2. `for (let seed = a; seed < b; …)` — the range [a, b − 1];
 *   3. `Array.from({ length: L }, (_, i) => a + i)` on a seed line — [a, a + L − 1];
 *   4. `fc.integer({ min: a, max: b })` on a seed line — [a, b];
 *   5. the numbers inside `[…]` on a line declaring `…SEEDS = `;
 *   6. the numeric argument of `generateFamily(…, n)`, `config(n)` and
 *      `instance(…, n)`.
 * A test that spelled a seed some other way would escape extraction; the blunt
 * check below closes the case that matters — no test file contains a literal
 * in either corpus seed band at all.
 */

const ROOT = join(import.meta.dirname, "..");
const SELF = "tests/test-seed-registry.test.ts";

/** `docs/BENCH_V2_PREREGISTRATION.md §2.2`'s corpus seeds. */
const CORPUS_BANDS = Object.freeze([
  { from: 9200, to: 9216, block: "P" },
  { from: 9300, to: 9304, block: "S" },
]);

interface Range {
  readonly from: number;
  readonly to: number;
  readonly source?: string;
}

const registry = JSON.parse(readFileSync(join(ROOT, "scripts/test-seed-registry.json"), "utf8")) as {
  readonly ranges: readonly Range[];
};

function testFiles(): string[] {
  const roots = [
    ...["packages", "apps"].flatMap((top) =>
      readdirSync(join(ROOT, top)).map((name) => join(ROOT, top, name, "tests")),
    ),
    join(ROOT, "tests"),
  ];
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      if (entry === "node_modules") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  for (const root of roots) walk(root);
  return out;
}

const num = (raw: string): number =>
  /^0x/i.test(raw) ? Number.parseInt(raw.replace(/_/g, "").replace(/n$/, ""), 16) : Number(raw.replace(/_/g, ""));

interface Found {
  readonly file: string;
  readonly line: number;
  readonly from: number;
  readonly to: number;
}

function extract(file: string): Found[] {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  const found: Found[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, index) => {
    const at = (from: number, to = from): void => {
      found.push({ file: rel, line: index + 1, from, to });
    };
    const seedLine = /seed/i.test(text);
    for (const m of text.matchAll(/\b(?:[A-Z_]*SEED[A-Z_]*|seed)\s*[=:]\s*(0x[0-9a-fA-F_]+n?|\d[\d_]*)\b/g)) {
      if (m[1] !== undefined) at(num(m[1]));
    }
    const loop = /for \(let seed = (\d[\d_]*); seed < (\d[\d_]*);/.exec(text);
    if (loop?.[1] !== undefined && loop[2] !== undefined) at(num(loop[1]), num(loop[2]) - 1);
    const series = /Array\.from\(\{ length: (\d[\d_]*) \}, \(_, i\) => (\d[\d_]*) \+ i\)/.exec(text);
    if (seedLine && series?.[1] !== undefined && series[2] !== undefined) {
      at(num(series[2]), num(series[2]) + num(series[1]) - 1);
    }
    const arb = /fc\.integer\(\{ min: (\d[\d_]*), max: (\d[\d_]*) \}\)/.exec(text);
    if (seedLine && arb?.[1] !== undefined && arb[2] !== undefined) at(num(arb[1]), num(arb[2]));
    const list = /SEEDS\w*\s*=\s*[^[]*\[([^\]]*)\]/.exec(text);
    if (list?.[1] !== undefined) for (const m of list[1].matchAll(/\b\d[\d_]*\b/g)) at(num(m[0]));
    for (const m of text.matchAll(/\b(?:generateFamily\([^,()]+,|instance\([^,()]+,|config\()\s*(\d[\d_]*)\s*\)/g)) {
      if (m[1] !== undefined) at(num(m[1]));
    }
  });
  return found;
}

const covered = (f: Found): boolean => registry.ranges.some((r) => f.from >= r.from && f.to <= r.to);

describe("the test-seed registry (bench-v2 gate G-F)", () => {
  const files = testFiles();
  const found = files.flatMap(extract);

  it("finds the seeds it was built from — the extraction is not vacuous", () => {
    expect(files.length).toBeGreaterThan(150);
    expect(found.some((f) => f.from === 7001)).toBe(true);
    expect(found.some((f) => f.from === 20_000 && f.to === 999_999)).toBe(true);
    expect(found.some((f) => f.from === 40_000 && f.to > 40_000)).toBe(true);
    expect(found.some((f) => f.from === 7001 && f.to === 7200)).toBe(true);
  });

  it("covers every seed any test file uses", () => {
    const outside = found.filter((f) => !covered(f)).map((f) => `${f.file}:${String(f.line)} [${String(f.from)}, ${String(f.to)}]`);
    expect(outside, "register these in scripts/test-seed-registry.json, or change the test").toStrictEqual([]);
  });

  it("is disjoint from both bench-v2 corpus seed bands", () => {
    for (const band of CORPUS_BANDS) {
      for (const r of registry.ranges) {
        expect(r.to < band.from || r.from > band.to, `[${String(r.from)}, ${String(r.to)}] meets block ${band.block}`).toBe(true);
      }
    }
  });

  it("no test file spells a corpus seed anywhere, in any form the patterns miss", () => {
    const hits: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).replaceAll("\\", "/");
      if (rel === SELF) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((text, index) => {
          for (const m of text.matchAll(/\b9_?[23]\d\d\b/g)) {
            const n = num(m[0]);
            if (CORPUS_BANDS.some((b) => n >= b.from && n <= b.to)) hits.push(`${rel}:${String(index + 1)} ${m[0]}`);
          }
        });
    }
    expect(hits).toStrictEqual([]);
  });
});
