import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CONVENTIONS, UNRATIFIED, UNRATIFIED_COUNT } from "../src/index.js";

/**
 * The independence discipline, made executable.
 *
 * `PREREGISTRATION.md §6.2` `AL1` and `DECISION_BRIEF.md §L.1` rule 3 are
 * enforced by ESLint in CI. This suite checks the same properties from inside
 * the package, plus the ones a linter cannot express — that the oracle performs
 * no I/O, and that it does not borrow a predicate from `@assay/domain` that the
 * engine will also use.
 */

const SRC = resolve(fileURLToPath(new URL(".", import.meta.url)), "../src");

function sources(): { name: string; text: string }[] {
  return readdirSync(SRC)
    .filter((f) => f.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(SRC, name), "utf8") }));
}

/**
 * Only the import statements, with comments stripped.
 *
 * The prose in these modules deliberately *names* the things it refuses to use —
 * `checkReconLineInvariants`, `@assay/ledger` — and explains why. A scan over
 * raw file text would flag that documentation as a violation, which is a false
 * positive that would push a future author to delete the explanation. What the
 * rule is actually about is what the module *imports*.
 */
function importsOf(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .split("\n")
    .filter((l) => /^\s*(import|export)\b/.test(l) || /\bfrom\s+["']/.test(l))
    .join("\n");
}

describe("AL1 — the import bans, checked from inside the package", () => {
  it("imports neither packages/engine nor packages/generator", () => {
    for (const { name, text } of sources()) {
      expect(importsOf(text), name).not.toMatch(/from\s+["']@assay\/(engine|generator)/);
      expect(importsOf(text), name).not.toMatch(/import\(\s*["'][^"']*\/(engine|generator)\//);
    }
  });

  it("does not import the quarantined text store", () => {
    // §5.2 gives the oracle "no soft scoring": SE2 and SE4 read quarantined
    // text, so an oracle that could reach it could score. The engine's ban is
    // linted; the oracle's is not, so it is asserted here.
    for (const { name, text } of sources()) {
      expect(importsOf(text), name).not.toMatch(/@assay\/domain\/untrusted-text/);
    }
  });
});

describe("AL2 — the oracle performs no I/O at all", () => {
  it("imports no filesystem, network or process module", () => {
    for (const { name, text } of sources()) {
      expect(importsOf(text), name).not.toMatch(/from\s+["']node:(fs|http|https|net|child_process)/);
      expect(importsOf(text), name).not.toMatch(/require\(\s*["']fs["']/);
    }
  });

  it("reads no clock and draws no randomness, so its output is a function of its input", () => {
    for (const { name, text } of sources()) {
      expect(importsOf(text), name).not.toMatch(/Date\.now\(|new Date\(/);
      expect(importsOf(text), name).not.toMatch(/Math\.random\(/);
    }
  });
});

describe("independence from the engine's predicates (ARCHITECTURE §7.2)", () => {
  it("re-implements C5 rather than importing @assay/domain's ingest invariants", () => {
    // checkReconLineInvariants computes the same arithmetic for stage S0.
    // Sharing it would make engine and oracle one implementation for C5, and
    // §5.3's consistency gate would compare that function with itself.
    for (const { name, text } of sources()) {
      expect(importsOf(text), name).not.toMatch(/checkReconLineInvariants|gstIdentityHolds/);
      expect(importsOf(text), name).not.toMatch(/checkPaymentInvariants|checkRefundInvariants/);
    }
  });

  it("does not route materiality through the agent's journal module", () => {
    for (const { name, text } of sources()) {
      expect(importsOf(text), name).not.toMatch(/@assay\/ledger/);
    }
  });
});

describe("the convention register", () => {
  it("pins the count of unratified conventions", () => {
    // A new unratified parameter must not be addable without a human being told.
    expect(UNRATIFIED).toHaveLength(UNRATIFIED_COUNT);
  });

  it("gives every convention an id, a subject, a decision and a reason", () => {
    for (const c of CONVENTIONS) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.subject.length).toBeGreaterThan(0);
      expect(c.decision.length).toBeGreaterThan(0);
      expect(c.why.length).toBeGreaterThan(40);
    }
  });

  it("has no duplicate ids", () => {
    expect(new Set(CONVENTIONS.map((c) => c.id)).size).toBe(CONVENTIONS.length);
  });

  it("keeps B6 unratified — its reading is still this package's own choice", () => {
    expect(UNRATIFIED.map((c) => c.id)).toContain("O-C2-REFUND");
  });

  it("records B7 as RATIFIED at spec 1.4.6, citing the clause that settled it", () => {
    const tau = CONVENTIONS.find((c) => c.id === "O-TAU-BASE");
    expect(tau?.spec_basis).toMatch(/DATA_MODEL\.md §11/);
    expect(tau?.spec_basis).toMatch(/1\.4\.6/);
    expect(UNRATIFIED.map((c) => c.id)).not.toContain("O-TAU-BASE");
  });

  it("still records that the base swap MOVED labels — ratification is not amnesia", () => {
    // The earlier row was escalated on a demonstrated divergence, not on doubt.
    // Ratifying the base settles WHICH side is normative; it does not make the
    // divergence go away, and a row that stopped saying so would let a future
    // reader assume the two bases had always agreed. The property suite pins
    // the counterexample; this pins the register's account of it.
    const tau = CONVENTIONS.find((c) => c.id === "O-TAU-BASE");
    expect(tau?.why).toMatch(/CONSEQUENTIAL/);
    expect(tau?.why).toMatch(/2x a target base/);
  });

  it("registers WHICH anchor test removes a member from the search space", () => {
    // The rule was implicit in a filter until spec 1.4.6's component work made
    // the node set normative. It is ratified on an EQUIVALENCE, so the row must
    // cite the population rules that establish it, not a clause choosing it.
    const t = CONVENTIONS.find((c) => c.id === "O-ANCHOR-TEST");
    expect(t?.spec_basis).toMatch(/PREREGISTRATION\.md §4\.3/);
    expect(t?.spec_basis).toMatch(/§4\.2/);
    expect(t?.decision).toMatch(/settlement_id !== null/);
    expect(UNRATIFIED.map((c) => c.id)).not.toContain("O-ANCHOR-TEST");
    // And it must keep stating what it assumes, so the assumption stays checkable.
    expect(t?.why).toMatch(/DECLARED POPULATION/);
  });

  it("registers the component node set that the base is summed over", () => {
    const nodes = CONVENTIONS.find((c) => c.id === "O-COMPONENT-NODES");
    expect(nodes?.spec_basis).toMatch(/RECONCILIATION_SPEC\.md §5/);
    expect(nodes?.decision).toMatch(/UNANCHORED/);
    expect(nodes?.decision).toMatch(/member-eligible/);
  });
});
