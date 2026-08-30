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
 * > executor, under `RECONCILIATION_SPEC.md §6.2`'s `P_max` budget."*
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
  it("is reachable only from the probe dispatch, under P_max", () => {
    const path = "bench/dev/recon_report.jsonl";
    expect(() => assertReadable(path, "PROBE_DISPATCH")).not.toThrow();
    expect(() => assertReadable(path, AGENT)).toThrow(PathGuardError);
    // AL8 unlocks ONE artifact for ONE zone; the generator's trust zone is not
    // it, and letting the oracle's own pre-agent pass reach the report would
    // void PREREGISTRATION.md §5.3's expressibility scoping (§10 V22).
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

describe("AL5 — the --sealed flag", () => {
  /**
   * *"The CLI's `--sealed` flag refuses to print, log or write any ground-truth
   * field; only aggregate metrics are emitted."*
   *
   * Enforced at the read, because a field that was never read cannot be
   * printed. Under `--sealed` the `GENERATOR_TRUST` unlock is withdrawn and no
   * zone may reach the artifact.
   */
  it("withdraws AL2's unlock for every zone", () => {
    const sealed = { sealed: true };
    for (const zone of ["AGENT", "PROBE_DISPATCH", "GENERATOR_TRUST"] as const) {
      expect(() => assertReadable("bench/test/ground_truth.jsonl", zone, sealed), zone).toThrow(
        PathGuardError,
      );
    }
  });

  it("leaves AL8's single route alone — --sealed is about ground truth", () => {
    expect(() =>
      assertReadable("bench/dev/recon_report.jsonl", "PROBE_DISPATCH", { sealed: true }),
    ).not.toThrow();
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

  it("classifies without deciding — isRestricted takes no zone", () => {
    expect(isRestricted("a/b/ground_truth.jsonl")).toBe(true);
    expect(isRestricted("a/b/recon_report.jsonl")).toBe(true);
    expect(isRestricted("a/b/observations.jsonl")).toBe(false);
  });
});
