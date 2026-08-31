/**
 * The CLI's failure surface, and its exit codes.
 *
 * Three of the five codes exist because a specification distinguishes the
 * failure they name from every other one, and a caller — CI, a reviewer's
 * script, `packages/eval`'s agent runner — has to be able to tell them apart
 * without parsing prose:
 *
 * ```
 *   3  UNAVAILABLE   a stage this command needs is not built yet
 *   4  GUARD         PREREGISTRATION.md §6.2 AL2 / AL8 refused a read
 *   5  REPLAY_MISS   DECISION_BRIEF.md §L.1 rule 11 -- "a cache miss is a hard
 *                    error, never a silent live call"
 * ```
 *
 * `UNAVAILABLE` is deliberately not folded into the generic failure. `§L.2`
 * fixes a build order and `ARCHITECTURE.md §3` fixes who owns what; a command
 * whose dependency has not been built yet has **not** failed, and reporting it
 * as a failure would invite the one repair the ownership rules forbid — writing
 * the missing side here.
 */

/** Process exit codes. `0` is success and is not an error. */
export const EXIT = Object.freeze({
  OK: 0,
  FAILURE: 1,
  USAGE: 2,
  UNAVAILABLE: 3,
  GUARD: 4,
  REPLAY_MISS: 5,
} as const);

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** Base class for every failure the CLI reports rather than crashes on. */
export class CliError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

/** A malformed command line. */
export class UsageError extends CliError {
  constructor(message: string) {
    super(message, EXIT.USAGE);
    this.name = "UsageError";
  }
}

/**
 * An agent whose pipeline dependency is not built (spec 1.4.29, M47).
 *
 * Distinct from {@link UnavailableStageError} because an agent is not a command:
 * it names the component `EVALUATION_SPEC.md §3` says it *is*, and the package
 * that owes the piece it cannot run without. Same exit code, because
 * `errors.ts`'s own rule holds — a stage that has not been built has **not**
 * failed, and reporting it as a failure would invite the one repair the
 * ownership rules forbid.
 */
export class AgentUnavailableError extends CliError {
  /** `EVALUATION_SPEC.md §3`'s id. */
  readonly agentId: string;
  /** The package or module that owns the missing work. */
  readonly blockedBy: string;

  constructor(agentId: string, blockedBy: string, citation: string, detail: string) {
    super(
      `agent ${agentId}: blocked on ${blockedBy}. ${detail} (${citation}). ` +
        `apps/cli composes the agents and implements no stage of the pipeline, so this is ` +
        `reported rather than worked around: EVALUATION_SPEC.md §3.2 makes an ablation a ` +
        `control only while it differs from ASSAY in exactly one respect, and a stand-in ` +
        `built here would be a second difference nobody recorded.`,
      EXIT.UNAVAILABLE,
    );
    this.name = "AgentUnavailableError";
    this.agentId = agentId;
    this.blockedBy = blockedBy;
  }
}

/**
 * A command whose surface is defined but whose dependency is not built.
 *
 * Carries the blocking dependency and the citation that assigns it to another
 * package, so the message names the owner rather than inviting the reader to
 * look for the gap here. `apps/cli` is a composition root: everything it cannot
 * do, it cannot do because something it composes does not exist yet, and
 * `ARCHITECTURE.md §3` says which package that is in every case.
 */
export class UnavailableStageError extends CliError {
  /** The package or module that owns the missing work. */
  readonly owner: string;
  /** The normative citation that assigns it there. */
  readonly citation: string;

  constructor(command: string, owner: string, citation: string, detail: string) {
    super(
      `assay ${command}: blocked on ${owner}. ${detail} ` +
        `(${citation}). apps/cli composes the pipeline and does not implement ` +
        `any part of it, so this is reported rather than worked around.`,
      EXIT.UNAVAILABLE,
    );
    this.name = "UnavailableStageError";
    this.owner = owner;
    this.citation = citation;
  }
}
