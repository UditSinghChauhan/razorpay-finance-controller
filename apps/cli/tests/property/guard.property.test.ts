import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PathGuardError, assertReadable, isRestricted } from "../../src/index.js";

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

describe("AL2/AL8 hold over every path shape", () => {
  it("no agent-zone read of a barred basename is ever admitted", () => {
    fc.assert(
      fc.property(prefix, suffix, fc.constantFrom("ground_truth", "recon_report"), (dir, tail, stem) => {
        expect(() => assertReadable(`${dir}${stem}${tail}.jsonl`, "AGENT")).toThrow(PathGuardError);
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

  it("each artifact is admitted by exactly one zone, and --sealed removes AL2's", () => {
    fc.assert(
      fc.property(prefix, suffix, (dir, tail) => {
        const gt = `${dir}ground_truth${tail}.jsonl`;
        const rr = `${dir}recon_report${tail}.jsonl`;

        expect(() => assertReadable(gt, "GENERATOR_TRUST")).not.toThrow();
        expect(() => assertReadable(rr, "PROBE_DISPATCH")).not.toThrow();

        expect(() => assertReadable(gt, "PROBE_DISPATCH")).toThrow(PathGuardError);
        expect(() => assertReadable(rr, "GENERATOR_TRUST")).toThrow(PathGuardError);

        expect(() => assertReadable(gt, "GENERATOR_TRUST", { sealed: true })).toThrow(
          PathGuardError,
        );
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
