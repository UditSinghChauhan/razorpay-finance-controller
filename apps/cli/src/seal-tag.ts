import { BENCHMARK_VERSION } from "@assay/generator";

import { UsageError } from "./errors.js";

/**
 * `PREREGISTRATION.md §9` step 1's tag, and the attestation that names it.
 *
 * **Ratified at spec 1.4.29, register row `DATA_MODEL.md §22.2` M45.** Through
 * spec 1.4.28 `§9`'s own note named a condition and revoked it in one sentence —
 * *"remains refused until this procedure's step 1 has been taken; `§6.1`'s
 * forbidden list bars … before the seal, and nothing here lifts that"* — so step
 * 2 of the seal procedure was not executable, and `DECISION_BRIEF.md §A.34`
 * recorded that as an open item. The defect was a term defined twice:
 *
 * ```
 *   THE SEAL        §9 step 1's signed tag.   §6.1's "before the seal" boundary.
 *   THE SEAL POINT  §9 step 6's commit SHA.   the provenance record, not the bar.
 * ```
 *
 * The tag reading is the ratified one, because it is the only one under which
 * `§9`'s own steps 2 through 5 are executable.
 *
 * **This module detects nothing.** `commands/seal.ts` states the principle it
 * shares: *"This process does not shell out to `git` … a commit SHA read by
 * running a subprocess is a fact about the working tree rather than about the
 * sealed artifact."* `eslint.config.js` bans every transport under `apps/cli/**`
 * and `node:child_process` is nowhere in this workspace. Whether the tag exists
 * is therefore a fact this process cannot establish, and `commands/generate.ts`
 * has always said what follows: *"a command that guessed would guess in the
 * direction that costs a seed."*
 *
 * What is left is the operator's **attestation**, and M45 holds its semantics to
 * the minimum that does the job:
 *
 * ```
 *   1. Presence lifts the --split test refusal. Absent, the refusal stands
 *      exactly as at spec 1.4.28 and AL7 stays fail-closed.
 *   2. The value must equal bench-v<BENCHMARK_VERSION> exactly -- checkable
 *      without git, and the mechanism that makes M46's 1.0.6/1.0.7 drift
 *      unrepeatable.
 *   3. It is refused unless --split is test, so it cannot sit inert in a script.
 *   4. It is recorded in BenchmarkManifest.seal_signature, a field
 *      DATA_MODEL.md §18 already types "signed git tag name".
 *   5. It is an ATTESTATION, NOT A CONTROL. PREREGISTRATION.md §10 V3 already
 *      declares the residual -- "Developer tunes against the test split ...
 *      Moderate -- self-enforced" -- so no new threat class is opened.
 * ```
 *
 * No field, artifact, trust zone, exit code or subprocess is added.
 */

/**
 * `§9` step 1's tag name, derived from the frozen constant rather than typed.
 *
 * `M46` exists because `§9`'s literals were transcribed and then drifted from
 * the constant they were meant to track. Deriving removes the class of defect:
 * a `BENCHMARK_VERSION` bump moves this name with it, and an attestation naming
 * the old tag is refused rather than accepted.
 */
export const SEAL_TAG = `bench-v${BENCHMARK_VERSION}`;

/**
 * `M45` clause 2 — the attested value must be `§9` step 1's tag.
 *
 * @throws UsageError when the value is anything else.
 */
export function checkSealTag(value: string, flag: string): void {
  if (value === SEAL_TAG) return;
  throw new UsageError(
    `--${flag} must name PREREGISTRATION.md §9 step 1's tag, which is ` +
      `${JSON.stringify(SEAL_TAG)} at benchmark version ${BENCHMARK_VERSION}; received ` +
      `${JSON.stringify(value)}. The name is derived from BENCHMARK_VERSION rather than ` +
      `transcribed, because §9's own literals drifted from it once already (spec 1.4.29, ` +
      `register row M46) and an attestation naming a stale tag is exactly that defect ` +
      `re-entering through the command line.`,
  );
}
