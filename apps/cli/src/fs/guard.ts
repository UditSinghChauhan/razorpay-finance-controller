import { basename, resolve } from "node:path";

import { CliError, EXIT } from "../errors.js";

/**
 * The `PREREGISTRATION.md §6.2` `AL2` / `AL8` **runtime path guard**.
 *
 * ```
 *   AL2  Neither engine nor oracle code may read a file matching
 *        **\/ground_truth*.jsonl. Enforced by a runtime path guard that throws.
 *   AL8  Neither engine nor oracle code may read a file matching
 *        **\/recon_report*.jsonl. Enforced by the same runtime path guard as
 *        AL2 and by an ESLint rule. The artifact is reachable ONLY through the
 *        probe executor, under RECONCILIATION_SPEC.md §6.2's P_max budget.
 * ```
 *
 * **Why the guard lives here and can live nowhere else.** Both rules name
 * `packages/engine` and `packages/oracle` as the constrained parties, but
 * neither package performs any I/O at all — `ARCHITECTURE.md §3` gives the
 * engine *"no I/O, no network"* and `packages/oracle`'s own header records that
 * *"there is nothing here for such a guard to intercept, which is a stronger
 * property than passing one"*. A guard installed in a package that never opens a
 * file intercepts nothing. `ARCHITECTURE.md §3` gives `apps/cli` **all**
 * filesystem I/O, so this is the only process point at which a read of either
 * artifact can occur, and therefore the only point at which one can be refused.
 *
 * **Why the guard is keyed on the consumer and not on the path alone.** Both
 * artifacts have exactly one legitimate reader, and a guard that refused the
 * path outright would refuse those too:
 *
 * ```
 *   ground_truth*.jsonl   the completeness gate, which ARCHITECTURE.md §10 runs
 *                         "inside the generator's trust zone, offline, before
 *                         any agent exists"
 *   recon_report*.jsonl   the §6.2 probe, and AL8 says "ONLY through the probe
 *                         executor, under P_max"
 * ```
 *
 * Every read therefore declares the zone the bytes are being acquired **for**,
 * and the guard answers a question about that pair. A caller cannot widen its
 * own zone: `ReadZone` is a closed union, the zone is an argument at the call
 * site, and `tests/discipline.test.ts` asserts that every zone but the two
 * privileged ones is used from a command that has no route to the restricted
 * artifact.
 */

/**
 * `AL5`: *"The CLI's `--sealed` flag refuses to print, log or write any
 * ground-truth field; only aggregate metrics are emitted."*
 *
 * Modelled as a property of the guard rather than of the printer, because a
 * field cannot be printed if it was never read. Under `sealed`, the
 * `GENERATOR_TRUST` unlock for ground truth is withdrawn and **no** zone may
 * read it.
 */
export interface GuardPolicy {
  readonly sealed: boolean;
}

/**
 * Who the bytes are being read for.
 *
 * The three values are the three trust zones the specification already draws;
 * no fourth is invented here.
 */
export type ReadZone =
  /**
   * Anything on the agent path — the observation set, the replay cache, a run's
   * ledger events. Both restricted artifacts are refused.
   */
  | "AGENT"
  /**
   * The `RECONCILIATION_SPEC.md §6.2` probe dispatch, under `P_max`. `AL8`'s
   * single permitted route to the PG-side recon report. Ground truth stays
   * refused: `AL8` unlocks one artifact, not the category.
   */
  | "PROBE_DISPATCH"
  /**
   * `ARCHITECTURE.md §10`'s *"generator's trust zone, offline, before any agent
   * exists"* — the completeness gate and the seal's artifact hashing. Ground
   * truth is unlocked unless `--sealed`; the recon report is not, because `AL8`
   * gives it exactly one route and this is not it.
   */
  | "GENERATOR_TRUST";

/** The two artifacts `AL2` and `AL8` name, as the rules spell their globs. */
export const RESTRICTED_ARTIFACTS = Object.freeze([
  Object.freeze({
    rule: "AL2",
    glob: "**/ground_truth*.jsonl",
    /**
     * Anchored at the basename. `AL2`'s glob is `**\/ground_truth*.jsonl`, whose
     * `**\/` matches any directory prefix, so the whole of the pattern's
     * discriminating power is in the final path segment.
     */
    match: /^ground_truth.*\.jsonl$/i,
    unlockedFor: "GENERATOR_TRUST" as ReadZone,
    why:
      "ARCHITECTURE.md §10 runs the completeness gate inside the generator's " +
      "trust zone, offline, before any agent exists.",
  }),
  Object.freeze({
    rule: "AL8",
    glob: "**/recon_report*.jsonl",
    match: /^recon_report.*\.jsonl$/i,
    unlockedFor: "PROBE_DISPATCH" as ReadZone,
    why:
      "PREREGISTRATION.md §6.2 AL8: reachable ONLY through the probe executor, " +
      "under RECONCILIATION_SPEC.md §6.2's P_max budget.",
  }),
] as const);

/**
 * Raised when a read is refused. Never caught inside this package.
 *
 * `AL7` burns a seed on *"any breach of the `§6.1` forbidden list"*, so a
 * refusal has to be loud and has to name the rule that refused. Distinct from
 * every other failure by exit code, so a harness can tell a guard trip from a
 * missing file.
 */
export class PathGuardError extends CliError {
  readonly rule: string;
  readonly zone: ReadZone;
  readonly path: string;

  constructor(rule: string, zone: ReadZone, path: string, detail: string) {
    super(
      `PREREGISTRATION.md §6.2 ${rule}: refused to read ${JSON.stringify(path)} ` +
        `for zone ${zone}. ${detail}`,
      EXIT.GUARD,
    );
    this.name = "PathGuardError";
    this.rule = rule;
    this.zone = zone;
    this.path = path;
  }
}

/**
 * Case-insensitive matching, deliberately wider than the literal glob.
 *
 * `AL2` and `AL8` are written in lowercase, but on a case-insensitive
 * filesystem `Ground_Truth.jsonl` opens the same bytes as `ground_truth.jsonl`.
 * Matching case-insensitively can only ever refuse **more** than the literal
 * pattern, never less, so it cannot admit a file the rule bars — and a guard
 * whose coverage depends on which filesystem the reviewer re-runs on is not a
 * guard.
 */
function segmentOf(path: string): string {
  // `resolve` first: `AL2`'s `**/` prefix means a traversal such as
  // `bench/dev/../dev/ground_truth.jsonl` names a barred file, and only a
  // normalized path exposes that. Backslashes are folded because a
  // Windows-shaped separator must not hide the final segment from `basename`.
  return basename(resolve(path.replaceAll("\\", "/")));
}

/**
 * Decide a read, and throw if the rules refuse it.
 *
 * Called by `io.ts` on **every** read, before the file is opened. Returning a
 * value rather than only throwing would let a caller ignore the answer, so this
 * returns `void` and the refusal is the throw.
 *
 * @throws PathGuardError when `AL2` or `AL8` bars the pair.
 */
export function assertReadable(
  path: string,
  zone: ReadZone,
  policy: GuardPolicy = { sealed: false },
): void {
  const segment = segmentOf(path);

  for (const artifact of RESTRICTED_ARTIFACTS) {
    if (!artifact.match.test(segment)) continue;

    if (policy.sealed && artifact.rule === "AL2") {
      throw new PathGuardError(
        "AL5",
        zone,
        path,
        "--sealed refuses to print, log or write any ground-truth field; a " +
          "field that was never read cannot be printed. Only aggregate metrics " +
          "are emitted under this flag.",
      );
    }

    if (zone === artifact.unlockedFor) return;

    throw new PathGuardError(
      artifact.rule,
      zone,
      path,
      `${artifact.glob} is reachable only from zone ${artifact.unlockedFor}. ${artifact.why}`,
    );
  }
}

/**
 * Whether a path is one of the two restricted artifacts, for any zone.
 *
 * Exposed for tests and for a caller that wants to report the classification
 * without attempting the read. It answers a question about the **path**; the
 * decision is `assertReadable`'s and takes the zone.
 */
export function isRestricted(path: string): boolean {
  const segment = segmentOf(path);
  return RESTRICTED_ARTIFACTS.some((artifact) => artifact.match.test(segment));
}
