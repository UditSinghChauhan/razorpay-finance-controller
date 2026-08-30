import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PathGuardError, assertReadable, isRestricted, type ReadZone } from "../../src/index.js";

/**
 * `PREREGISTRATION.md §6.2` `AL2`/`AL8` as properties rather than as examples.
 *
 * `DECISION_BRIEF.md §L.3` requires property tests on every invariant a package
 * owns. `tests/workspace-suite-floor.test.ts` scopes that floor to `packages/*`
 * and exempts apps — but the guard is the one invariant this package genuinely
 * owns, `AL7` burns a seed on any breach of it, and an example-based suite
 * proves only that the paths someone thought of are refused.
 */

/** A directory prefix of arbitrary depth — the `**\/` half of both globs. */
const prefix = fc
  .array(
    fc.stringMatching(/^[A-Za-z0-9_.-]{1,8}$/).filter((s) => s !== "." && s !== ".."),
    { maxLength: 6 },
  )
  .map((parts) => (parts.length === 0 ? "" : `${parts.join("/")}/`));

/** A suffix the `*` in `ground_truth*.jsonl` admits. */
const suffix = fc.stringMatching(/^[A-Za-z0-9_.-]{0,10}$/);

/** The closed `ReadZone` union, spelled out so a fifth zone breaks this suite. */
const ZONES: readonly ReadZone[] = Object.freeze([
  "AGENT",
  "PROBE_DISPATCH",
  "GENERATOR_TRUST",
  "SEAL",
]);

describe("AL2/AL8 hold over every path shape", () => {
  it("no agent-zone read of a barred basename is ever admitted", () => {
    fc.assert(
      fc.property(prefix, suffix, fc.constantFrom("ground_truth", "recon_report"), (dir, tail, stem) => {
        expect(() => assertReadable(`${dir}${stem}${tail}.jsonl`, "AGENT")).toThrow(PathGuardError);
      }),
      { numRuns: 2000 },
    );
  });

  it("every zone is refused for some barred artifact, so no zone is a skeleton key", () => {
    // Including SEAL. A zone that admitted both artifacts would be the widening
    // §A.31 rejected, wearing a different name.
    fc.assert(
      fc.property(prefix, suffix, fc.constantFrom(...ZONES), (dir, tail, zone) => {
        const refused = ["ground_truth", "recon_report"].filter((stem) => {
          try {
            assertReadable(`${dir}${stem}${tail}.jsonl`, zone);
            return false;
          } catch {
            return true;
          }
        });
        expect(refused.length, zone).toBeGreaterThan(0);
      }),
      { numRuns: 2000 },
    );
  });

  it("a directory prefix never changes the classification", () => {
    // The whole discriminating power of `**/x*.jsonl` is in the final segment,
    // so prepending directories must be inert. A guard that matched on the
    // whole path would be defeated by moving the file.
    fc.assert(
      fc.property(prefix, suffix, fc.constantFrom("ground_truth", "recon_report"), (dir, tail, stem) => {
        const name = `${stem}${tail}.jsonl`;
        expect(isRestricted(`${dir}${name}`)).toBe(isRestricted(name));
      }),
      { numRuns: 2000 },
    );
  });

  it("each artifact is admitted by exactly the zones its rule names", () => {
    // The whole four-by-two matrix, over every path shape rather than over the
    // four literals `tests/guard.test.ts` spells. `AL2` names one zone; `AL8`
    // names two after spec 1.4.24 (M38) — the probe's, and the offline seal's,
    // which is seal-scoped and deliberately NOT a widening of GENERATOR_TRUST
    // (`DECISION_BRIEF.md §A.31`).
    fc.assert(
      fc.property(prefix, suffix, (dir, tail) => {
        const gt = `${dir}ground_truth${tail}.jsonl`;
        const rr = `${dir}recon_report${tail}.jsonl`;

        expect(() => assertReadable(gt, "GENERATOR_TRUST")).not.toThrow();
        expect(() => assertReadable(rr, "PROBE_DISPATCH")).not.toThrow();
        expect(() => assertReadable(rr, "SEAL")).not.toThrow();

        expect(() => assertReadable(gt, "AGENT")).toThrow(PathGuardError);
        expect(() => assertReadable(gt, "PROBE_DISPATCH")).toThrow(PathGuardError);
        // SEAL carries AL8's exception and only that one: the seal reads ground
        // truth through AL2's own GENERATOR_TRUST route, so a caller cannot
        // reach it by declaring itself the seal.
        expect(() => assertReadable(gt, "SEAL")).toThrow(PathGuardError);

        expect(() => assertReadable(rr, "AGENT")).toThrow(PathGuardError);
        // §5.3 / §10 V22: the completeness gate must never hold the report.
        expect(() => assertReadable(rr, "GENERATOR_TRUST")).toThrow(PathGuardError);
      }),
      { numRuns: 2000 },
    );
  });

  it("--sealed removes AL2's zone and neither of AL8's", () => {
    // AL5 is scoped to AL2 in `guard.ts`: the recon report holds no
    // ground-truth field, so the flag has nothing to keep out of the output.
    fc.assert(
      fc.property(prefix, suffix, (dir, tail) => {
        const sealed = { sealed: true };
        const gt = `${dir}ground_truth${tail}.jsonl`;
        const rr = `${dir}recon_report${tail}.jsonl`;

        for (const zone of ZONES) {
          expect(() => assertReadable(gt, zone, sealed)).toThrow(PathGuardError);
        }
        expect(() => assertReadable(rr, "PROBE_DISPATCH", sealed)).not.toThrow();
        expect(() => assertReadable(rr, "SEAL", sealed)).not.toThrow();
      }),
      { numRuns: 2000 },
    );
  });

  it("a name that does not begin with the stem is never restricted", () => {
    fc.assert(
      fc.property(
        prefix,
        fc.stringMatching(/^[A-Za-z0-9_.-]{1,12}$/).filter(
          (s) => !/^(ground_truth|recon_report)/i.test(s),
        ),
        (dir, name) => {
          expect(isRestricted(`${dir}${name}.jsonl`)).toBe(false);
        },
      ),
      { numRuns: 2000 },
    );
  });
});
