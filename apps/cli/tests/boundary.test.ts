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

/**
 * The two composition roots, and the one licence they hold.
 *
 * *"A composition root may CALL a stage; it may not BE one."* `probe/run.ts`
 * has held it since spec 1.4.25 — it sequences `RECONCILIATION_SPEC.md §6.6`'s
 * chain and invokes `packages/engine`'s own `solve` — and `src/agents/**` holds
 * it from spec 1.4.29 (`DATA_MODEL.md §22.2` M47) for the same reason and no
 * wider one: an agent is *"a composition of engine, llm, probe and ledger behind
 * `@assay/eval`'s one interface"* (`src/index.ts`), so it necessarily calls
 * every stage it composes.
 *
 * **What the licence is not.** It permits a CALL and an IMPORT; it permits no
 * declaration. Every assertion below that bans *declaring* a stage, minting a
 * `ValidatedDecision`, spelling a frozen threshold's value, reaching `../fs/`,
 * naming a probe, opening a transport or writing a decimal literal applies to
 * these two files exactly as it applies to every other one.
 */
const isCompositionRoot = (rel: string): boolean =>
  rel === "probe/run.ts" || rel.startsWith("agents/");

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
    //
    // Reading the owning package's own constant is not a second spelling, and
    // `src/agents/**` has one place it must: `DATA_MODEL.md §13` makes
    // `epsilon_bps` a REQUIRED field of an `AmbiguityCertificate` — the
    // certificate "records whichever margin was in force" — and no result type
    // in `packages/engine` carries it, while `tau_paise` and
    // `materiality_paise` arrive on `SolveResult`. So the composition root
    // imports `EPSILON_BPS` from the module that freezes it and compares it
    // against nothing. The declaration ban below is unchanged and is what §L.1
    // rule 12 actually protects: no file here may DECLARE a threshold, and
    // nothing outside `src/agents/**` may name one at all.
    const FROZEN =
      /\b(TAU|EPSILON_BPS|K_MAX|C_MAX|P_MAX|SE_WEIGHTS_BPS|C_REVIEW|C_EXCEPTION|K_SIGMA|QUEUE_TOP_N)\b/;
    for (const { rel, text } of sources) {
      const body = code(text);
      // Nobody declares one, anywhere -- including the composition roots.
      expect(body, rel).not.toMatch(
        /\b(const|let|var|function)\s+(TAU|EPSILON_BPS|K_MAX|C_MAX|P_MAX|SE_WEIGHTS_BPS|C_REVIEW|C_EXCEPTION|K_SIGMA|QUEUE_TOP_N)\b/,
      );
      if (rel.startsWith("agents/")) {
        // The single exception, and it is exactly one name reached through
        // exactly one package: EPSILON_BPS from @assay/engine.
        expect(body.replace(/\bEPSILON_BPS\b/g, ""), rel).not.toMatch(FROZEN);
        // And where it does appear it is reached from the package that freezes
        // it. Import shapes are read from the RAW source: `code()` blanks string
        // literals, so a module specifier is invisible to it — the same reading
        // `probe/run.ts`'s `solve` assertion uses.
        if (FROZEN.test(body)) {
          expect(text, rel).toMatch(
            /import\s*\{[^}]*\bEPSILON_BPS\b[^}]*\}\s*from\s*"@assay\/engine"/s,
          );
        }
        continue;
      }
      expect(body, rel).not.toMatch(FROZEN);
    }
  });

  it("evaluates no constraint and enumerates no candidate", () => {
    for (const { rel, text } of sources) {
      const body = code(text);
      // A composition root may CALL a stage; it may not BE one. `probe/run.ts`
      // sequences §6.6's chain and invokes the engine's own `solve`, and
      // `agents/**` composes S1-S5 behind ARCHITECTURE.md §10's one interface —
      // so the ban is on declaring a stage, not on calling one.
      expect(body, rel).not.toMatch(/\b(function|const|let)\s+(anchor|decompose|solve|evaluate|generateCandidates)\b/);
      // `S2`'s enumeration is the engine's and is never re-derived: an agent
      // may call `generateCandidates`, and no file may spell a constraint check
      // or a second admissibility test.
      expect(body, rel).not.toMatch(/\b(checkC[1-8]|HARD_CONSTRAINTS|isAdmissible)\b/);
      if (isCompositionRoot(rel)) continue;
      expect(body, rel).not.toMatch(/\bgenerateCandidates\b/);
      expect(body, rel).not.toMatch(/\b(anchor|decompose|solve|evaluate)\s*\(/);
    }
  });

  it("obtains `solve` from packages/engine and re-implements nothing of S4", () => {
    const run = sources.find((f) => f.rel === "probe/run.ts");
    expect(run).toBeDefined();
    const raw = run?.text ?? "";
    const body = code(raw);
    // Import shapes are read from the RAW source: `code()` strips string
    // literals, so a module specifier is invisible to it.
    expect(raw).toMatch(/import\s*\{[^}]*\bsolve\b[^}]*\}\s*from\s*"@assay\/engine"/s);
    // None of S4's own work happens here: no scoring, no ranking, no tie-break.
    expect(body).not.toMatch(/evidence_score_bps|canonical_key|delta_s_bps\s*=|materiality_paise\s*=/);
  });

  it("mints no ValidatedDecision and posts no journal line", () => {
    // §L.1 rule 4: only packages/engine/src/s5-validate.ts may construct one,
    // and packages/ledger has "exactly one write path".
    //
    // The name `ValidatedDecision` stays banned in every file, composition roots
    // included: the widening assertion is the engine's and the type is never
    // spelled here, so a cast to it cannot be written. `appendEvent` stays
    // banned for the same reason — appending is the write path's, and
    // `postValidatedDecision` is how a composition root reaches it.
    for (const { rel, text } of sources) {
      const body = code(text);
      // Word-bounded: `postValidatedDecision` is packages/ledger's ONE mutating
      // function and is how a composition root reaches the write path at all,
      // while the bare type name is what a widening assertion would have to
      // spell. §L.1 rule 4 admits the first and permits the second nowhere here.
      expect(body, rel).not.toMatch(/\bValidatedDecision\b|appendEvent\s*\(/);
      // `journalFor` is packages/ledger's pure function over a PROPOSED
      // allocation (ARCHITECTURE.md §4 boundary 3), which is what makes it
      // callable before S5 rather than after it. An agent must call it to have
      // journal lines for `I1` to balance; declaring one here would fork
      // §17.1.1's table, and that is what stays banned.
      expect(body, rel).not.toMatch(/\b(function|const|let)\s+journalFor\b/);
      if (isCompositionRoot(rel)) continue;
      expect(body, rel).not.toMatch(/journalFor/);
    }
  });
});

describe("4 — it dispatches the probe loop; it does not own it", () => {
  it("constructs no probe call — the brand is never widened here", () => {
    // RECONCILIATION_SPEC.md §6.2, spec 1.4.23: packages/probe is "the ONLY
    // constructor of a probe call, so a caller cannot dispatch around them".
    // Spec 1.4.25 gives this package the DISPATCH (§6.6), which takes a
    // ValidatedProbeCall it cannot build: the brand is non-exported and there is
    // no widening assertion anywhere in this package.
    for (const { rel, text } of sources) {
      const body = code(text);
      expect(body, `${rel} widens the probe-call brand`).not.toMatch(
        /as\s+(unknown\s+as\s+)?ValidatedProbeCall/,
      );
    }
  });

  it("names a probe only under src/probe/, where §6.6 puts the dispatch", () => {
    for (const { rel, text } of sources) {
      if (rel.startsWith("probe/") || rel === "index.ts") continue;
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

  it("never names widen_temporal_window ANYWHERE — R3 may not propose it (M40)", () => {
    // The dispatch answers a ValidatedProbeCall, and R3 cannot name the fifth
    // probe. This package has no reason to mention it and does not.
    for (const { rel, text } of sources) {
      expect(code(text), rel).not.toContain("widen_temporal_window");
    }
  });

  it("assembles no PROBE event body and accounts for no budget of its own", () => {
    for (const { rel, text } of sources) {
      const body = code(text);
      // `probeEventBody` is packages/probe's (M37). This package may CALL it;
      // declaring one here would fork the §16 body.
      expect(body, rel).not.toMatch(/(function|const)\s+probeEventBody\b/);
      expect(body, rel).not.toMatch(/\bP_MAX\b/);
      // `attempts_remaining` is budget arithmetic and `probeEventBody` is §16's
      // body: both stay inside src/probe/ for every file.
      if (rel.startsWith("probe/")) continue;
      expect(body, rel).not.toMatch(/probeEventBody|attempts_remaining/);
      // `probes_attempted` is NOT budget arithmetic: DATA_MODEL.md §13 makes it
      // a field of the AmbiguityCertificate — "what we tried before giving up" —
      // which the agent mints and packages/probe reports. It is read from the
      // loop's own state and never counted here.
      if (rel.startsWith("agents/")) continue;
      expect(body, rel).not.toMatch(/probes_attempted/);
    }
  });

  it("imports the loop's decisions rather than reproducing them", () => {
    const run = sources.find((f) => f.rel === "probe/run.ts");
    const raw = run?.text ?? "";
    const body = code(raw);
    for (const owned of ["decide", "offerR3Proposal", "acceptResult", "probeEventBody"]) {
      expect(body, `probe/run.ts must import ${owned}`).toContain(owned);
    }
    expect(raw).toMatch(/from\s*"@assay\/probe"/);
    // No budget arithmetic and no enum test is re-derived here: `validate`'s
    // four controls are packages/probe's and are reached only through
    // `offerR3Proposal`.
    expect(body).not.toMatch(/attempts\s*>=|attempts\s*<\s*pMax|PROBE_KINDS|isR3ProposableKind/);
    // `hasEntityId` IS called, and must be: PREREGISTRATION.md §7 defines an
    // eligible argument as one passing "the already-frozen deterministic
    // validity and pre-call I6 checks", so the context is filtered before R3
    // sees it. packages/probe re-runs the same check independently afterwards,
    // which is what §L.1 rule 8's "independently of any allowlist check"
    // requires — the two are not redundant.
    expect(body).toMatch(/hasEntityId\s*\(/);
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
      // Appended at spec 1.4.29 (DATA_MODEL.md §22.2 M48): EVALUATION_SPEC.md §7
      // has invoked `assay report` since before this CLI existed while T0-11
      // enumerated seven, so the command was required by the reproducibility
      // guarantee and present in no list.
      "commands/report.ts",
      "commands/run.ts",
      "commands/seal.ts",
      "commands/types.ts",
      "commands/verify.ts",
    ]);
  });

  it("writes three dataset artifacts per seed and the probe surface once per split", () => {
    // Spec 1.4.27 (M42): the dataset artifact unit is (split, seed) and family is
    // a COMPOSITION dimension, so the seed loop writes three files and the
    // split-scoped §6.2 surface is written once, outside it. Asserted from the
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

    const loopAt = body.indexOf("for (const seed of seeds)");
    const declAt = body.indexOf("export const generateCommand");
    expect(loopAt).toBeGreaterThan(-1);
    expect(declAt).toBeGreaterThan(loopAt);
    const loop = body.slice(loopAt, declAt);

    // Three writes inside the seed loop -- one per dataset artifact -- and one
    // more after it, for the split-scoped recon report. Four writes in the
    // command, arranged as M42 arranges the files.
    const inLoop = loop.slice(0, loop.indexOf("mergeReconReports"));
    expect(inLoop.match(/context\.sink\.write\(/g)).toHaveLength(3);
    expect(body.match(/context\.sink\.write\(/g)).toHaveLength(4);

    // The recon report write is NOT in the seed loop: one file per split, from
    // every seed the invocation generated (M36 keeps it split-scoped, M42 leaves
    // it there).
    expect(inLoop).not.toContain("RECON_REPORT");
    expect(body).toContain("mergeReconReports");

    // No family dimension anywhere in the write path: M42 makes family a
    // composition dimension, and `buildDataset` owns the concatenation.
    expect(body).not.toContain("for (const family of");
    expect(body).toContain("buildDataset");

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
