import { createHash } from "node:crypto";

import { sha256Field, type Sha256 } from "@assay/domain";

/**
 * SHA-256 over the **bytes of an artifact**.
 *
 * Distinct from `packages/ledger`'s `hashCanonical`, and deliberately not built
 * from it. `hashCanonical` digests the canonical JSON of a *value* — the form
 * `DATA_MODEL.md §16` requires of anything entering a hashed event body.
 * `BenchmarkManifest.observations_sha256` and its two siblings digest a *file*,
 * so that `PREREGISTRATION.md §9`'s seal binds the exact committed bytes a
 * reviewer will re-read. Feeding a file's text through `hashCanonical` would
 * digest a JSON-quoted copy of it instead, which is a different number that
 * commits to nothing a reviewer can reproduce with `sha256sum`.
 *
 * `node:crypto` and not a dependency: `EVALUATION_SPEC.md §7` names pinned
 * dependencies among the reproducibility guarantees, and a builtin is the one
 * kind of dependency that cannot drift between the sealed run and a re-run.
 *
 * The result is branded through `packages/domain`'s own `sha256Field`, so the
 * spelling contract — *"lowercase hex is this package's contract"* — is asserted
 * by the package that owns it rather than assumed here.
 */
export function sha256Text(text: string): Sha256 {
  return sha256Field.parse(createHash("sha256").update(text, "utf8").digest("hex"));
}
