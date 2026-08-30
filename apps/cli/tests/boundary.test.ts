import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The architectural properties `apps/cli` exists to have, read as text.
 *
 * The construction is `packages/probe`'s and `packages/engine`'s: *"`eslint.config.js`
 * declares these boundaries, and a lint rule that stops running is a boundary
 * everyone believes is guarded."* It matters more here than anywhere else,
 * because `ARCHITECTURE.md §3` gives this package **all** filesystem I/O — it is
 * the one package whose whole justification is a boundary it could quietly stop
 * holding.
 *
 * Five claims are asserted:
 *
 * ```
 *   1  one door         node: builtins are imported only under src/fs/, and
 *                       every read passes the AL2/AL8 guard first
 *   2  no S0 transform  RECONCILIATION_SPEC.md §2's five steps are absent
 *   3  no S1-S5         no frozen threshold, no constraint, no stage
 *   4  no probe loop    no probe call is constructed here (spec 1.4.23)
 *   5  no R3, no wire   no proposal policy, no transport, no float
 * ```
 *
 * A sixth group, *"the surface stays honest"*, asserts the positive claims the
 * package makes about itself — where its command files live, that only `main.ts`
 * reads `process`, and that `generate` writes every artifact it says it does.
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

/** Source with comments removed, so a normative citation is never a match. */
function decomment(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Source with comments **and string-literal text** removed.
 *
 * Every assertion below is about what this package *does*, and an error message
 * that quotes the rule it is enforcing is prose, not behaviour. `commands/
 * generate.ts` has to be able to say the words "fetch_settlement_recon" in the
 * sentence explaining that it cannot produce that probe's surface; a check that
 * failed on it would be a check that punishes the report for being specific.
 *
 * Interpolation bodies are **kept**: `${expr}` inside a template is code, and
 * dropping it would open exactly the hole these assertions exist to close.
 */
function code(text: string): string {
  const source = decomment(text);
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        i += source[i] === "\\" ? 2 : 1;
      }
      i += 1;
      out += '""';
      continue;
    }
    if (ch === "`") {
      i += 1;
      while (i < source.length && source[i] !== "`") {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }
        if (source[i] === "$" && source[i + 1] === "{") {
          i += 2;
          let depth = 1;
          out += " ";
          while (i < source.length && depth > 0) {
            if (source[i] === "{") depth += 1;
            else if (source[i] === "}") depth -= 1;
            if (depth > 0) out += source[i] ?? "";
            i += 1;
          }
          out += " ";
          continue;
        }
        i += 1;
      }
      i += 1;
      out += '""';
      continue;
    }
    out += ch ?? "";
    i += 1;
  }
  return out;
}

function specifiers(text: string): string[] {
  const stripped = decomment(text);
  const out: string[] = [];
  for (const re of [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g]) {
    for (const m of stripped.matchAll(re)) if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

const files = sourceFiles(SRC);
const sources = files.map((file) => ({
  file,
  rel: relative(SRC, file).split(sep).join("/"),
  text: readFileSync(file, "utf8"),
}));

const inFsModule = (rel: string): boolean => rel.startsWith("fs/");

describe("1 — one door", () => {
  it("imports node: builtins only under src/fs/", () => {
    // ARCHITECTURE.md §3 gives apps/cli "all filesystem I/O". The property that
    // makes PREREGISTRATION.md §6.2's AL2/AL8 guard a guard is that there is no
    // second door: a command that reached for node:path on its own would be one
    // step from reaching for node:fs.
    for (const { rel, text } of sources) {
      for (const spec of specifiers(text)) {
        if (!spec.startsWith("node:")) continue;
        expect(inFsModule(rel), `${rel} imports ${spec} outside src/fs/`).toBe(true);
      }
    }
  });

  it("calls readFileSync in exactly one file", () => {
    const readers = sources.filter(({ text }) => code(text).includes("readFileSync"));
    expect(readers.map((r) => r.rel)).toEqual(["fs/io.ts"]);
  });

  it("guards that read: readText calls assertReadable before it opens anything", () => {
    const io = sources.find((s) => s.rel === "fs/io.ts");
    expect(io).toBeDefined();
    const body = code(io?.text ?? "");
    const guardAt = body.indexOf("assertReadable(request.path");
    const openAt = body.indexOf("readFileSync(request.path");
    expect(guardAt).toBeGreaterThan(-1);
    expect(openAt).toBeGreaterThan(guardAt);
  });

  it("routes existence checks through the guard too", () => {
    // AL7 treats a breach as having happened once the bytes exist in the
    // process; knowing that a barred artifact is present is already a read of it.
    const io = code(sources.find((s) => s.rel === "fs/io.ts")?.text ?? "");
    expect(io).toContain("export function exists");
    const existsBody = io.slice(io.indexOf("export function exists"));
    expect(existsBody.indexOf("assertReadable")).toBeLessThan(existsBody.indexOf("existsSync("));
  });
});

describe("2 — no S0 transform", () => {
  /**
   * `ARCHITECTURE.md §3`: the CLI *"acquires raw source contents and passes them
   * into `packages/domain`'s `S0` boundary, and **performs no `S0` transform
   * itself** (spec 1.4.18)"*. `RECONCILIATION_SPEC.md §2` lists the five steps
   * that make up the transform; none of them appears below.
   */
  it("declares no schema of its own", () => {
    // Step 1, "parse per source schema; reject unknown fields (strict zod)".
    // zod is not even a dependency of this package.
    for (const { rel, text } of sources) {
      expect(code(text), rel).not.toMatch(/\bz\.(object|string|number|union|discriminatedUnion)\b/);
      expect(specifiers(text), rel).not.toContain("zod");
    }
  });

  it("asserts no ingest invariant", () => {
    // Step 2, "assert per-entity ingest invariants (DATA_MODEL.md §2-§9)".
    for (const { rel, text } of sources) {
      expect(code(text), rel).not.toMatch(
        /check(Payment|Order|Refund|ReconLine)Invariants|gstIdentityHolds/,
      );
    }
  });

  it("never touches the quarantined text store", () => {
    // Step 3, "split structural fields from free text". The CLI writes
    // untrusted_text.jsonl as opaque records produced by packages/generator; it
    // never imports the separately-bannable module or reads a text field.
    for (const { rel, text } of sources) {
      expect(specifiers(text), rel).not.toContain("@assay/domain/untrusted-text");
      expect(code(text), rel).not.toMatch(/\b(narration|order_receipt|memo_text)\b/);
    }
  });

  it("normalizes nothing and stamps no provenance", () => {
    // Steps 4 and 5: "normalize: amounts to Paise; timestamps to Unix seconds;
    // UTRs upper-cased" and "stamp provenance and ingest_hash".
    for (const { rel, text } of sources) {
      const body = code(text);
      expect(body, rel).not.toMatch(/normalizeUtr|ingest_hash\s*[:=]|source_line\s*[:=]/);
      expect(body, rel).not.toMatch(/\bpaise\s*\(/);
    }
  });
});

describe("3 — no S1-S5 duplication", () => {
  it("holds no frozen threshold of its own", () => {
    // §L.1 rule 12 freezes tau, epsilon, K_max, C_max, P_max, C_review,
    // C_exception, k_sigma, queue_top_n and the SE1-SE5 weights. A second
    // spelling of any of them, anywhere, is a second thing to keep in step.
    for (const { rel, text } of sources) {
      expect(code(text), rel).not.toMatch(
        /\b(TAU|EPSILON_BPS|K_MAX|C_MAX|P_MAX|SE_WEIGHTS_BPS|C_REVIEW|C_EXCEPTION|K_SIGMA|QUEUE_TOP_N)\b/,
      );
    }
  });

  it("evaluates no constraint and enumerates no candidate", () => {
    for (const { rel, text } of sources) {
      const body = code(text);
      expect(body, rel).not.toMatch(/\b(checkC[1-8]|HARD_CONSTRAINTS|generateCandidates|isAdmissible)\b/);
      expect(body, rel).not.toMatch(/\b(anchor|decompose|solve|evaluate)\s*\(/);
    }
  });

  it("mints no ValidatedDecision and posts no journal line", () => {
    // §L.1 rule 4: only packages/engine/src/s5-validate.ts may construct one,
    // and packages/ledger has "exactly one write path".
    for (const { rel, text } of sources) {
      expect(code(text), rel).not.toMatch(/ValidatedDecision|journalFor|appendEvent\s*\(/);
    }
  });
});

describe("4 — no probe loop", () => {
  it("constructs no probe call", () => {
    // RECONCILIATION_SPEC.md §6.2, spec 1.4.23: packages/probe is "the ONLY
    // constructor of a probe call, so a caller cannot dispatch around them".
    for (const { rel, text } of sources) {
      const body = code(text);
      for (const probe of [
        "fetch_order",
        "fetch_payment",
        "fetch_refund",
        "fetch_settlement_recon",
        "widen_temporal_window",
      ]) {
        expect(body, `${rel} names ${probe}`).not.toContain(probe);
      }
    }
  });

  it("accounts for no probe budget and assembles no PROBE event", () => {
    for (const { rel, text } of sources) {
      expect(code(text), rel).not.toMatch(/probeEventBody|attempts_remaining|probes_attempted/);
    }
  });
});

describe("5 — no R3, no transport, no float", () => {
  it("authors no probe-proposal policy", () => {
    // R3 is DECISION_BRIEF.md §H tier H1 and unbuilt. A proposal source written
    // here would be R3 under another name.
    for (const { rel, text } of sources) {
      expect(code(text), rel).not.toMatch(/propose_probe|NO_USEFUL_PROBE|ProbeProposal/);
    }
  });

  it("imports no transport at all", () => {
    // §L.1 rule 10 and §C T0-11: the pipeline runs from a clean checkout with no
    // API key. Banning the transports outright is stronger than trusting a code
    // path not to take them.
    const banned = [
      "http", "https", "net", "tls", "dgram", "http2",
      "node:http", "node:https", "node:net", "node:tls", "node:dgram", "node:http2",
      "undici", "node-fetch", "axios",
    ];
    for (const { rel, text } of sources) {
      for (const spec of specifiers(text)) {
        expect(banned, `${rel} imports ${spec}`).not.toContain(spec);
      }
      expect(code(text), rel).not.toMatch(/\bfetch\s*\(|new\s+WebSocket\b/);
    }
  });

  it("introduces no floating point", () => {
    // §L.1 rule 1: "No floating point anywhere, including intermediates, JSON
    // and SQLite columns." This package performs no arithmetic on money at all.
    for (const { rel, text } of sources) {
      const body = code(text);
      expect(body, rel).not.toMatch(/parseFloat|toFixed|Number\.EPSILON/);
      // A decimal literal. `Math.floor(Date.now() / 1000)` is integer division
      // to Unix seconds (DATA_MODEL.md §0 rule 2) and carries no decimal point.
      expect(body, rel).not.toMatch(/(?<![\w.])\d+\.\d+/);
    }
  });
});

describe("the surface stays honest", () => {
  it("keeps every command file under src/commands/", () => {
    const commandFiles = sources.filter((s) => s.rel.startsWith("commands/")).map((s) => s.rel);
    expect(commandFiles.sort()).toEqual([
      "commands/bench.ts",
      "commands/close.ts",
      "commands/generate.ts",
      "commands/index.ts",
      "commands/oracle.ts",
      "commands/run.ts",
      "commands/seal.ts",
      "commands/types.ts",
      "commands/verify.ts",
    ]);
  });

  it("writes §6.2's probe surface beside the other three artifacts, for every family", () => {
    // Spec 1.4.24 (M38) closed the gap `generate` used to report: the rows are
    // packages/generator's and the write is this package's. Asserted from the
    // source because PREREGISTRATION.md §9 sequences every real generation after
    // the seal tag, so the command's happy path cannot be driven here.
    const generate = sources.find((s) => s.rel === "commands/generate.ts");
    expect(generate).toBeDefined();
    const body = decomment(generate?.text ?? "");

    for (const artifact of [
      "observations.jsonl",
      "untrusted_text.jsonl",
      "ground_truth.jsonl",
      "recon_report.jsonl",
    ]) {
      expect(body, artifact).toContain(artifact);
    }

    // Four writes, inside the one `for (const family of ...)` loop, so the
    // artifact is produced for every family the split table assigns.
    const loopAt = body.indexOf("for (const family of");
    const declAt = body.indexOf("export const generateCommand");
    expect(loopAt).toBeGreaterThan(-1);
    expect(declAt).toBeGreaterThan(loopAt);
    const loop = body.slice(loopAt, declAt);
    expect(loop.match(/context\.sink\.write\(/g)).toHaveLength(4);

    // And unconditioned on the split: `split` names a directory and checks §6.1's
    // frozen table, both above the loop, and no artifact below is written behind
    // a test on it. Whichever splits the command accepts, all four are written.
    expect(loop).not.toContain("split");

    // The BLOCKED report is gone. A command that still announced a gap it has
    // closed would be exactly as misleading as one that never reported it.
    expect(body).not.toContain("BLOCKED");
  });

  it("reads process only in main.ts", () => {
    // Everything else takes argv, env and its output as arguments, so the whole
    // CLI is exercisable from a test without a live process.
    for (const { rel, text } of sources) {
      if (rel === "main.ts") continue;
      expect(code(text), rel).not.toMatch(/\bprocess\./);
    }
  });
});
