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
 *        The offline seal is the one exception and is not a second evidence
 *        path (spec 1.4.24, M38): §9 step 4 requires it to hash the file, it
 *        is neither engine nor oracle, it spends no P_max, and a digest
 *        carries no constituent identifier into any decision. The permission
 *        is seal-scoped: it does NOT extend to the §5.3 completeness gate,
 *        which stays observations-only.
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
 * **Why the guard is keyed on the consumer and not on the path alone.** Each
 * artifact has a named legitimate reader, and a guard that refused the path
 * outright would refuse those too:
 *
 * ```
 *   ground_truth*.jsonl   the completeness gate, which ARCHITECTURE.md §10 runs
 *                         "inside the generator's trust zone, offline, before
 *                         any agent exists" — and the seal, in that same zone
 *   recon_report*.jsonl   the §6.2 probe, and AL8 says "ONLY through the probe
 *                         executor, under P_max"; and, from spec 1.4.24 (M38),
 *                         the offline seal, which §9 step 4 requires to hash it
 * ```
 *
 * Every read therefore declares the zone the bytes are being acquired **for**,
 * and the guard answers a question about that pair. A caller cannot widen its
 * own zone: `ReadZone` is a closed union, the zone is an argument at the call
 * site, and `tests/discipline.test.ts` asserts that every zone but the
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
 * Three of these are the trust zones the specification already draws. `SEAL` is
 * the fourth, added at spec 1.4.24 (`DATA_MODEL.md §22.2` M38), and it exists
 * because `DECISION_BRIEF.md §A.31` **rejected** the one-line alternative of
 * widening `GENERATOR_TRUST` to cover the recon report: that zone is claimed by
 * *both* the `§5.3` completeness gate and the seal, and `§5.3` / `§10` V22
 * require the gate never to hold the report. Widening the shared zone *"would
 * have left that guarantee resting on the fact that no gate call site happens to
 * use it today. A distinct seal permission keeps it structural."* A fourth zone
 * is therefore not an invention but the shape that rejection has.
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
   * truth is unlocked unless `--sealed`; the recon report is not, and spec
   * 1.4.24 kept it that way on purpose — see `SEAL` below.
   */
  | "GENERATOR_TRUST"
  /**
   * `PREREGISTRATION.md §9`'s offline seal, and nothing else. `AL8`'s single
   * named exception, added at spec 1.4.24 (M38): `§9` step 4 hashes
   * `recon_report.jsonl` and step 5 makes its absence a **SEAL FAILURE**, which
   * is satisfiable only if the seal can open the file.
   *
   * `AL8`'s binding prohibition names **engine and oracle code** and the seal is
   * neither; its *"reachable only through the probe executor"* governs the
   * evidence path an **agent** may use. *"Hashing is not reachability: the seal
   * spends no `P_max`, runs before any agent exists, and a SHA-256 digest
   * carries no `constituent_entity_id` into any decision."*
   *
   * **Ground truth is not unlocked here.** The seal reads it in
   * `GENERATOR_TRUST`, the route `AL2` has permitted since `apps/cli` landed,
   * and `AL5` withdraws that route under `--sealed`. This zone carries `AL8`'s
   * new permission and only that one, so a caller cannot reach ground truth by
   * declaring itself the seal.
   */
  | "SEAL";

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
    /**
     * One zone, unchanged by spec 1.4.24. `ARCHITECTURE.md §10`'s trust zone
     * covers both readers `AL2` admits — the `§5.3` completeness gate and the
     * seal's ground-truth hashing — so nothing here needed a second entry.
     */
    unlockedFor: Object.freeze(["GENERATOR_TRUST"]) as readonly ReadZone[],
    why:
      "ARCHITECTURE.md §10 runs the completeness gate inside the generator's " +
      "trust zone, offline, before any agent exists.",
  }),
  Object.freeze({
    rule: "AL8",
    glob: "**/recon_report*.jsonl",
    match: /^recon_report.*\.jsonl$/i,
    /**
     * **Two** zones, and deliberately not one widened zone. `AL8` gives the
     * probe its single evidence route; spec 1.4.24 (M38) adds the offline seal,
     * whose permission is *"seal-scoped and distinct from the probe's — it does
     * not extend to `GENERATOR_TRUST`, so the `§5.3` completeness gate can never
     * reach the artifact and `§10` V22's asymmetry is preserved structurally"*.
     * Two entries here is what makes that separation a fact about the code.
     */
    unlockedFor: Object.freeze(["PROBE_DISPATCH", "SEAL"]) as readonly ReadZone[],
    why:
      "PREREGISTRATION.md §6.2 AL8: reachable ONLY through the probe executor, " +
      "under RECONCILIATION_SPEC.md §6.2's P_max budget, and — spec 1.4.24, " +
      "M38 — by PREREGISTRATION.md §9's offline seal, which step 4 requires to " +
      "hash the file. The seal's permission does not extend to GENERATOR_TRUST, " +
      "so §5.3's completeness gate can never reach the artifact.",
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
 * `zone X`, or `zones X and Y` — a refusal names every route that would work.
 *
 * A guard that says only "refused" teaches a caller nothing, and `AL7` burns a
 * seed on a breach: the cheapest way to make a legitimate reader declare the
 * right zone is to have the refusal tell it which zones exist.
 */
function zonesOf(zones: readonly ReadZone[]): string {
  return `${zones.length === 1 ? "zone" : "zones"} ${zones.join(" and ")}`;
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

    if (artifact.unlockedFor.includes(zone)) return;

    throw new PathGuardError(
      artifact.rule,
      zone,
      path,
      `${artifact.glob} is reachable only from ${zonesOf(artifact.unlockedFor)}. ${artifact.why}`,
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
