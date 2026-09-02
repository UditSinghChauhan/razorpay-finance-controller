import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PathGuardError,
  RESTRICTED_ARTIFACTS,
  assertReadable,
  isRestricted,
  type ReadZone,
} from "../src/index.js";

/**
 * `PREREGISTRATION.md §6.2` `AL2` and `AL8` — the runtime path guard.
 *
 * > `AL2` *"Neither engine nor oracle code may read a file matching
 * > `**\/ground_truth*.jsonl`. **Enforced by a runtime path guard that
 * > throws.**"*
 *
 * > `AL8` *"Neither engine nor oracle code may read a file matching
 * > `**\/recon_report*.jsonl`. Enforced by the same runtime path guard as `AL2`
 * > and by an ESLint rule. The artifact is reachable **only** through the probe
 * > executor, under `RECONCILIATION_SPEC.md §6.2`'s `P_max` budget. **The
 * > offline seal is the one exception and is not a second evidence path (spec
 * > 1.4.24, M38)** ... The permission is seal-scoped: it does **not** extend to
 * > the `§5.3` completeness gate, which stays observations-only."*
 *
 * `AL7` burns a seed on any breach, so these are the tests that have to hold
 * even when everything else is being rewritten.
 */

const AGENT: ReadZone = "AGENT";

describe("AL2 — **/ground_truth*.jsonl", () => {
  const barred = [
    "ground_truth.jsonl",
    "bench/dev/9000/F01/ground_truth.jsonl",
    "/abs/path/ground_truth_v2.jsonl",
    "./a/b/c/ground_truth-2026.jsonl",
  ];

  it("throws on every agent-zone read, at any depth", () => {
    for (const path of barred) {
      expect(() => assertReadable(path, AGENT), path).toThrow(PathGuardError);
    }
  });

  it("names AL2 in the failure, so a burn is attributable", () => {
    try {
      assertReadable("bench/dev/ground_truth.jsonl", AGENT);
      expect.unreachable("the guard admitted a barred artifact");
    } catch (error) {
      expect(error).toBeInstanceOf(PathGuardError);
      expect((error as PathGuardError).rule).toBe("AL2");
      expect((error as PathGuardError).message).toContain("§6.2");
    }
  });

  it("admits the one reader ARCHITECTURE.md §10 places inside the generator's trust zone", () => {
    expect(() => assertReadable("bench/dev/ground_truth.jsonl", "GENERATOR_TRUST")).not.toThrow();
  });

  it("does not admit it to the probe, which AL8 unlocks for a different artifact", () => {
    expect(() => assertReadable("bench/dev/ground_truth.jsonl", "PROBE_DISPATCH")).toThrow(
      PathGuardError,
    );
  });
});

describe("AL8 — **/recon_report*.jsonl", () => {
  const path = "bench/dev/recon_report.jsonl";

  it("is reachable from the probe dispatch, under P_max", () => {
    expect(() => assertReadable(path, "PROBE_DISPATCH")).not.toThrow();
  });

  it("is reachable from the offline seal, which §9 step 4 requires to hash it", () => {
    // Spec 1.4.24 (M38). AL8's binding prohibition names ENGINE AND ORACLE code
    // and the seal is neither; §9 step 5 makes a missing recon_report_sha256 a
    // SEAL FAILURE, which is satisfiable only if the seal can open the file.
    // "Hashing is not reachability: the seal spends no P_max, runs before any
    // agent exists, and a SHA-256 digest carries no constituent identifier."
    expect(() => assertReadable(path, "SEAL")).not.toThrow();
  });

  it("is refused on the agent path", () => {
    expect(() => assertReadable(path, AGENT)).toThrow(PathGuardError);
  });

  it("is still refused in GENERATOR_TRUST — the widening §A.31 rejected", () => {
    // The load-bearing assertion of the whole amendment. DECISION_BRIEF.md
    // §A.31 rejected widening GENERATOR_TRUST to cover this artifact, because
    // that zone is claimed by BOTH the §5.3 completeness gate and the seal, and
    // §5.3 / §10 V22 require the gate never to hold the report: an oracle or
    // gate holding it would void §5.3's expressibility scoping and make the gate
    // tautological. "A distinct seal permission keeps it structural" — and this
    // is the test that makes "structural" a property of the code rather than of
    // which call sites happen to exist today.
    expect(() => assertReadable(path, "GENERATOR_TRUST")).toThrow(PathGuardError);
  });

  it("names AL8", () => {
    try {
      assertReadable("recon_report_dev.jsonl", AGENT);
      expect.unreachable("the guard admitted a barred artifact");
    } catch (error) {
      expect((error as PathGuardError).rule).toBe("AL8");
    }
  });

  it("names both routes in the refusal, so a legitimate reader learns its zone", () => {
    try {
      assertReadable(path, AGENT);
      expect.unreachable("the guard admitted a barred artifact");
    } catch (error) {
      expect((error as PathGuardError).message).toContain("PROBE_DISPATCH and SEAL");
    }
  });
});

describe("SEAL carries AL8's exception and nothing else", () => {
  /**
   * The zone names a **permission**, not a caller. `assay seal` reads ground
   * truth in `GENERATOR_TRUST` — `AL2`'s route, unchanged since `apps/cli`
   * landed — and reads the recon report in `SEAL`. Keeping them apart is what
   * stops a caller reaching ground truth by declaring itself the seal.
   */
  it("does not unlock ground truth", () => {
    expect(() => assertReadable("bench/dev/ground_truth.jsonl", "SEAL")).toThrow(PathGuardError);
  });

  it("leaves AL2's own unlock exactly where it was", () => {
    expect(() => assertReadable("bench/dev/ground_truth.jsonl", "GENERATOR_TRUST")).not.toThrow();
  });
});

describe("the permission matrix, in full", () => {
  const GROUND_TRUTH = "bench/dev/ground_truth.jsonl";
  const RECON_REPORT = "bench/dev/recon_report.jsonl";

  /** Every pair the four zones and the two artifacts can form. */
  const ADMITTED: Readonly<Record<ReadZone, readonly string[]>> = {
    AGENT: [],
    PROBE_DISPATCH: [RECON_REPORT],
    GENERATOR_TRUST: [GROUND_TRUTH],
    SEAL: [RECON_REPORT],
  };

  it("admits exactly three of the eight pairs, and refuses the other five", () => {
    for (const zone of ["AGENT", "PROBE_DISPATCH", "GENERATOR_TRUST", "SEAL"] as const) {
      for (const path of [GROUND_TRUTH, RECON_REPORT]) {
        const label = `${zone} -> ${path}`;
        if (ADMITTED[zone].includes(path)) {
          expect(() => assertReadable(path, zone), label).not.toThrow();
        } else {
          expect(() => assertReadable(path, zone), label).toThrow(PathGuardError);
        }
      }
    }
  });

  it("leaves an unrestricted artifact readable from every zone", () => {
    for (const zone of ["AGENT", "PROBE_DISPATCH", "GENERATOR_TRUST", "SEAL"] as const) {
      expect(() => assertReadable("bench/dev/observations.jsonl", zone), zone).not.toThrow();
    }
  });
});

describe("path normalization — the '**/' half of both globs", () => {
  it("sees through a traversal that re-enters the barred name", () => {
    expect(() => assertReadable("bench/dev/../dev/ground_truth.jsonl", AGENT)).toThrow(
      PathGuardError,
    );
  });

  it("sees through a Windows-shaped separator", () => {
    expect(() => assertReadable("bench\\dev\\ground_truth.jsonl", AGENT)).toThrow(PathGuardError);
  });

  it("matches case-insensitively, which can only refuse more than the glob", () => {
    // On a case-insensitive filesystem Ground_Truth.jsonl opens the same bytes.
    expect(() => assertReadable("bench/Ground_Truth.JSONL", AGENT)).toThrow(PathGuardError);
  });

  it("does not refuse a file whose name merely contains the word", () => {
    // The globs anchor at the start of the final segment. A file named for the
    // artifact is barred; one that mentions it is not, and over-refusing would
    // make the guard something callers work around.
    expect(() => assertReadable("bench/dev/observations.jsonl", AGENT)).not.toThrow();
    expect(() => assertReadable("docs/about_ground_truth.md", AGENT)).not.toThrow();
    expect(() => assertReadable("bench/dev/ground_truth.json", AGENT)).not.toThrow();
  });
});

describe("M56 — AL5 is an EMISSION rule, and this guard does not enforce it", () => {
  /**
   * `DATA_MODEL.md §22.2` **M56** (spec 1.4.34, `DECISION_BRIEF.md §A.41`):
   * `AL5` — *"The CLI's `--sealed` flag refuses to print, log or write any
   * ground-truth field; only aggregate metrics are emitted"* — *"governs what
   * leaves the process, not what enters it"*. Through spec 1.4.33 this file
   * modelled it as a **read** refusal, taking a `GuardPolicy { sealed }` third
   * argument and withdrawing `GENERATOR_TRUST`'s `AL2` unlock under it. That
   * made `PREREGISTRATION.md §9` step 7 — `assay bench --sealed`, the only run
   * that ever scores TEST — unable to satisfy `EVALUATION_SPEC.md §2`'s
   * `score(agent output, ground truth, oracle labels)`.
   *
   * The withdrawal `§5.3` wrote is **preserved for the two readers it was
   * written against** and is carried elsewhere: `assay oracle` and `assay seal`
   * refuse `--sealed` as a usage error. `commands.test.ts` and
   * `layout-and-gates.test.ts` hold those.
   */
  it("takes the pair and nothing else — there is no sealed parameter left", () => {
    // A signature assertion rather than a prose one: a re-introduced policy
    // argument would be a return to the read-withdrawal reading M56 replaced.
    expect(assertReadable.length).toBe(2);
  });

  it("A — admits a GENERATOR_TRUST ground-truth read, sealed run or not", () => {
    // The load-bearing assertion of M56. The scorer reads here at §9 step 7,
    // through AL2's standing route, and the flag is not a term in the decision.
    expect(() => assertReadable("bench/test/9100/ground_truth.jsonl", "GENERATOR_TRUST"))
      .not.toThrow();
  });

  it("B — leaves every other AL2 restriction exactly where it was", () => {
    // AL2 is untouched in substance and in wording (§A.41's "unchanged" list):
    // no agent, engine or oracle reaches the artifact, sealed or not.
    for (const zone of ["AGENT", "PROBE_DISPATCH", "SEAL"] as const) {
      expect(() => assertReadable("bench/test/9100/ground_truth.jsonl", zone), zone).toThrow(
        PathGuardError,
      );
    }
  });

  it("leaves both of AL8's routes alone, as it always did", () => {
    expect(() => assertReadable("bench/dev/recon_report.jsonl", "PROBE_DISPATCH")).not.toThrow();
    expect(() => assertReadable("bench/dev/recon_report.jsonl", "SEAL")).not.toThrow();
    expect(() => assertReadable("bench/dev/recon_report.jsonl", "GENERATOR_TRUST")).toThrow(
      PathGuardError,
    );
  });

  it("K — adds no fifth ReadZone: the union still has exactly the four", () => {
    // §A.41 rejected a fifth zone for the scorer and preserved the rejection:
    // "AL2 names its constrained parties by package, so a zone expressing what
    // AL2's own sentence expresses is ceremony". The permission matrix above is
    // typed `Record<ReadZone, ...>`, so a fifth arm would already fail the
    // typecheck; this reads the declaration so the count is asserted directly.
    const source = readFileSync(
      join(import.meta.dirname, "..", "src", "fs", "guard.ts"),
      "utf8",
    );
    const declaration = source.slice(
      source.indexOf("export type ReadZone ="),
      source.indexOf('| "SEAL";') + '| "SEAL";'.length,
    );
    const arms = [...declaration.matchAll(/^\s*\|\s*"([A-Z_]+)"/gm)].map((m) => m[1]);
    expect(arms).toStrictEqual(["AGENT", "PROBE_DISPATCH", "GENERATOR_TRUST", "SEAL"]);
    // ...and the policy type the read-withdrawal reading needed is declared
    // nowhere: the prose above still names it, as the record of what was removed.
    expect(source).not.toMatch(/export (?:interface|type) GuardPolicy/);
    expect(source).not.toMatch(/policy: GuardPolicy/);
  });
});

describe("the declaration matches the rules it cites", () => {
  it("carries exactly the two artifacts AL2 and AL8 name", () => {
    expect(RESTRICTED_ARTIFACTS.map((a) => a.rule)).toEqual(["AL2", "AL8"]);
    expect(RESTRICTED_ARTIFACTS.map((a) => a.glob)).toEqual([
      "**/ground_truth*.jsonl",
      "**/recon_report*.jsonl",
    ]);
  });

  it("gives ground truth one zone and the recon report two", () => {
    // A single ReadZone per artifact could not express AL8 after spec 1.4.24,
    // and expressing it by widening GENERATOR_TRUST is what §A.31 rejected.
    expect(RESTRICTED_ARTIFACTS.map((a) => [...a.unlockedFor])).toEqual([
      ["GENERATOR_TRUST"],
      ["PROBE_DISPATCH", "SEAL"],
    ]);
  });

  it("classifies without deciding — isRestricted takes no zone", () => {
    expect(isRestricted("a/b/ground_truth.jsonl")).toBe(true);
    expect(isRestricted("a/b/recon_report.jsonl")).toBe(true);
    expect(isRestricted("a/b/observations.jsonl")).toBe(false);
  });
});
