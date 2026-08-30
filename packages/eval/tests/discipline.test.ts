import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AGENTS,
  AGENT_IDS,
  FROZEN_METRICS,
  agentDeclaration,
  blockedMetrics,
  computedMetrics,
  tier0Agents,
} from "../src/index.js";

/**
 * The measurement layer's discipline, made executable.
 *
 * `eslint.config.js` enforces the import bans in CI. This suite checks the same
 * properties from inside the package, plus the ones a linter cannot express:
 * that ground truth reaches exactly one module, that the agent-facing surface
 * cannot see it, and that nothing here performs I/O or reads a clock.
 *
 * It reads this package's own source as text, which is filesystem I/O — the
 * point `packages/engine`'s discipline suite already makes: *"The engine itself
 * performs no I/O; a test asserting that fact necessarily does."*
 */

const SRC = resolve(fileURLToPath(new URL(".", import.meta.url)), "../src");

interface Source {
  readonly name: string;
  readonly text: string;
}

/** Every `.ts` file under `src/`, including `gates/` and `metrics/`. */
function sources(): Source[] {
  return readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      return { name: relative(SRC, full).replaceAll("\\", "/"), text: readFileSync(full, "utf8") };
    })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * Only the import statements, with comments stripped.
 *
 * The prose in these modules deliberately *names* what it refuses to use —
 * `@assay/engine`, `@assay/llm`, `GroundTruth` — and explains why. A scan over
 * raw file text would flag that documentation as a violation, which is a false
 * positive that would push a future author to delete the explanation. What the
 * rule is about is what the module *imports*. The same reader
 * `packages/oracle/tests/discipline.test.ts` uses, for the same reason.
 */
function importsOf(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .split("\n")
    .filter((line) => /^\s*(import|export)\b/.test(line) || /\bfrom\s+["']/.test(line))
    .join("\n");
}

const importsPackage = (source: Source, pkg: string): boolean =>
  new RegExp(String.raw`from\s+["']@assay/${pkg}(["'/])`).test(importsOf(source.text));

const ALLOWLISTED = "gates/consistency-gate.ts";

describe("§L.1 rule 3 — the single permitted exception, checked by path", () => {
  it("finds the allowlisted file exactly where rule 3 names it", () => {
    // "The single permitted exception is packages/eval/src/gates/
    // consistency-gate.ts". The path is part of the rule: the lint allowlist
    // keys on it, so a rename silently unbinds the enforcement.
    expect(sources().map((s) => s.name)).toContain(ALLOWLISTED);
  });

  it("lets ONLY that file import packages/engine", () => {
    for (const source of sources()) {
      if (source.name === ALLOWLISTED) continue;
      expect(importsPackage(source, "engine"), source.name).toBe(false);
    }
    const gate = sources().find((s) => s.name === ALLOWLISTED);
    expect(gate).toBeDefined();
    expect(importsPackage(gate as Source, "engine")).toBe(true);
    expect(importsPackage(gate as Source, "oracle")).toBe(true);
  });

  it("keeps the differential test free of ground truth", () => {
    // Rule 3: the file "may contain no logic other than the differential test".
    // §5.3 splits the two gates deliberately -- consistency compares two
    // IMPLEMENTATIONS, completeness is the one that reads truth.
    const gate = sources().find((s) => s.name === ALLOWLISTED);
    expect(importsPackage(gate as Source, "generator")).toBe(false);
    expect(importsOf((gate as Source).text)).not.toMatch(/GroundTruth/);
  });

  it("keeps the differential test free of a second predicate implementation", () => {
    // It may compare; it may not decide. Every verdict must come from one of
    // the two packages under comparison.
    const gate = sources().find((s) => s.name === ALLOWLISTED);
    const text = (gate as Source).text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(text).toMatch(/\bevaluate\(/);
    expect(text).toMatch(/\bcheckAll\(/);
    expect(text).toMatch(/checkC3Ordering\(/);
    expect(text).toMatch(/checkC3BankArrival\(/);
    // No local re-implementation of a constraint.
    expect(text).not.toMatch(/function\s+c[1-8]\b/);
    expect(text).not.toMatch(/SETTLEMENT_WINDOW|TARGET_CURRENCY|EPSILON_BPS/);
  });
});

describe("AL1 / AL2 — where ground truth may go, and where it may not", () => {
  it("imports the generator from exactly one module", () => {
    const importers = sources().filter((s) => importsPackage(s, "generator")).map((s) => s.name);
    // `truth.ts` reads GroundTruth; `bootstrap.ts` reads the vendored PRNG
    // ARCHITECTURE.md §11 fixes for the project. Both are permitted -- AL1 binds
    // the engine and the oracle, not the scorer -- but the SET is pinned so a
    // third import site cannot appear unnoticed.
    expect(importers.sort()).toEqual(["bootstrap.ts", "truth.ts"]);
  });

  it("names GroundTruth in exactly one module", () => {
    const holders = sources()
      .filter((s) => importsOf(s.text).includes("GroundTruth"))
      .map((s) => s.name);
    expect(holders).toEqual(["truth.ts"]);
  });

  it("keeps the AGENT-FACING surface free of the generator entirely", () => {
    // EVALUATION_SPEC.md §2: "No agent ever sees ground truth or oracle labels."
    // agent.ts is the whole of what an agent is handed; it must not be able to
    // reach either, and `AgentInput` must carry no field that could.
    const agent = sources().find((s) => s.name === "agent.ts");
    expect(agent).toBeDefined();
    expect(importsPackage(agent as Source, "generator")).toBe(false);
    expect(importsPackage(agent as Source, "oracle")).toBe(false);

    const input = /export interface AgentInput \{([\s\S]*?)\n\}/.exec((agent as Source).text);
    expect(input).not.toBeNull();
    const body = input?.[1] ?? "";
    expect(body).not.toMatch(/ground_truth|groundTruth|GroundTruth/);
    expect(body).not.toMatch(/oracle|label/i);
    // `readonly` is every field's modifier, so the reader-shaped patterns are
    // matched against the field NAMES rather than the whole declaration.
    const names = [...body.matchAll(/^\s*readonly (\w+)/gm)].map((m) => m[1] ?? "");
    for (const name of names) {
      expect(name, name).not.toMatch(/path|file|dir|reader|read[A-Z_]|fetch|load/i);
    }
  });

  it("gives AgentInput exactly the two fields §2 admits", () => {
    const agent = sources().find((s) => s.name === "agent.ts");
    const input = /export interface AgentInput \{([\s\S]*?)\n\}/.exec((agent as Source).text);
    const fields = [...(input?.[1] ?? "").matchAll(/^\s*readonly (\w+)/gm)].map((m) => m[1]);
    expect(fields).toEqual(["observations", "config"]);
  });
});

describe("AL8 — the probe channel is the agent's, not the scorer's", () => {
  it("imports neither packages/probe nor packages/llm", () => {
    for (const source of sources()) {
      expect(importsPackage(source, "probe"), source.name).toBe(false);
      expect(importsPackage(source, "llm"), source.name).toBe(false);
    }
  });

  it("does not import the quarantined text store", () => {
    for (const source of sources()) {
      expect(importsOf(source.text), source.name).not.toMatch(/@assay\/domain\/untrusted-text/);
    }
  });
});

describe("purity — the scorer performs no I/O and reads no clock", () => {
  it("imports no filesystem, network or process module", () => {
    for (const source of sources()) {
      expect(importsOf(source.text), source.name).not.toMatch(
        /from\s+["']node:(fs|http|https|net|tls|child_process|dgram|http2)/,
      );
      expect(importsOf(source.text), source.name).not.toMatch(/require\(\s*["']fs["']/);
    }
  });

  it("reads no clock and draws no ambient randomness", () => {
    // Metric 23 requires two runs over identical inputs to agree, and §5.5
    // forbids "any number in the demo that does not exist in a committed run
    // artifact". A Math.random-driven bootstrap would put a different interval
    // in the report on every render of the same data.
    for (const source of sources()) {
      const code = source.text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, source.name).not.toMatch(/Date\.now\(|new Date\(/);
      expect(code, source.name).not.toMatch(/Math\.random\(/);
    }
  });
});

describe("the close gate stays where ARCHITECTURE §8 puts it", () => {
  it("computes no G1-G5 verdict of its own", () => {
    // ARCHITECTURE.md §8 and §L.2 place the close gate in packages/ledger Layer
    // B (close-gate.ts, close.ts), which do not exist. eval CONSUMES a close
    // outcome. Re-deriving the gates here would make the gate and its own check
    // one implementation -- the defect §7.2 exists to prevent for constraints.
    const closeLoop = sources().find((s) => s.name === "metrics/close-loop.ts");
    const code = (closeLoop as Source).text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // No hash chain recomputation (G4), no trial-balance assertion (G2), no
    // terminal-state sweep (G1), no invariants_failed scan (G5).
    expect(code).not.toMatch(/sha256|hashCanonical|verifyChain|projectChain/);
    expect(code).not.toMatch(/assertTrialBalance/);
    expect(code).not.toMatch(/invariants_failed/);
  });
});

describe("the agent registry — §3's table, as data", () => {
  it("declares every id, and every declaration has an id", () => {
    expect(AGENTS.map((a) => a.id).sort()).toEqual([...AGENT_IDS].sort());
    for (const id of AGENT_IDS) expect(agentDeclaration(id).id).toBe(id);
  });

  it("carries the seven agents ARCHITECTURE §10's diagram names", () => {
    expect(AGENT_IDS).toEqual([
      "ASSAY",
      "B0-IDONLY",
      "B1-GREEDY",
      "B2-LLM-DIRECT",
      "A1-NOVALIDATE",
      "A2-NOABSTAIN",
      "A3-NOLLM",
    ]);
  });

  it("records B1 as declared-but-not-built rather than omitting it (§3.1)", () => {
    // "(stretch -- DECISION_BRIEF.md §H, tier H2)", and §2's loop reads
    // "(+ B1 if built)". Omitting the row would hide §3.1's own justification:
    // "its absence weakens breadth, not validity".
    expect(agentDeclaration("B1-GREEDY").inTier0).toBe(false);
    expect(tier0Agents().map((a) => a.id)).toEqual([
      "ASSAY",
      "B0-IDONLY",
      "B2-LLM-DIRECT",
      "A1-NOVALIDATE",
      "A2-NOABSTAIN",
      "A3-NOLLM",
    ]);
  });

  it("gives every agent a role and a description that says what it represents", () => {
    for (const agent of AGENTS) {
      expect(["SYSTEM_UNDER_TEST", "BASELINE", "ABLATION"]).toContain(agent.role);
      expect(agent.represents.length).toBeGreaterThan(20);
    }
  });

  it("holds no agent IMPLEMENTATION anywhere in src/", () => {
    // §10: one interface, "so ablations are configuration flags rather than
    // forked codebases -- which is what makes them valid controls".
    for (const source of sources()) {
      const code = source.text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, source.name).not.toMatch(/implements\s+Agent\b/);
      expect(code, source.name).not.toMatch(/:\s*Agent\s*=/);
    }
  });
});

describe("§8's list says what is computed, and the claim is checkable", () => {
  it("names an existing module for every metric it declares computable", () => {
    // A list that says "computed" and points at nothing is how a report comes
    // to carry a metric no code produces. §5.4 item 5 requires the report to
    // carry "every metric in the frozen list", so the gap has to be visible.
    const files = new Set(sources().map((s) => s.name));
    for (const metric of computedMetrics()) {
      expect(files, `metric ${String(metric.number)} ${metric.name}`).toContain(
        metric.computedBy,
      );
    }
  });

  it("partitions the list: every metric is computed or blocked, never both", () => {
    for (const metric of FROZEN_METRICS) {
      expect(
        (metric.computedBy === null) !== (metric.blockedBy === null),
        `metric ${String(metric.number)}`,
      ).toBe(true);
    }
    expect(computedMetrics().length + blockedMetrics().length).toBe(FROZEN_METRICS.length);
  });

  it("gives every blocked metric a reason naming the missing dependency", () => {
    for (const metric of blockedMetrics()) {
      expect(metric.blockedBy?.length ?? 0, metric.name).toBeGreaterThan(20);
    }
  });
});
