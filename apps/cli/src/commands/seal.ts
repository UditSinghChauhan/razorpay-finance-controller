import { canonicalConstraintSet } from "@assay/domain";
import { buildManifest, familiesFor, BENCHMARK_VERSION, GT_VERSION } from "@assay/generator";

import { requireFlag, stringFlag } from "../args.js";
import { gateArtifactPasses } from "../artifacts/gate.js";
import { SEAL_TAG, checkSealTag } from "../seal-tag.js";
import { CliError, EXIT, UsageError } from "../errors.js";
import { sha256Text } from "../fs/digest.js";
import { join, readText } from "../fs/io.js";
import type { Command, CommandContext } from "./types.js";

/**
 * `assay seal` — assemble and write `BenchmarkManifest`.
 *
 * `packages/domain` names this command as the digest's owner in terms:
 * `canonicalConstraintSet()` *"returns the bytes to hash; **computing the digest
 * belongs to the stage that writes the manifest**"*. `packages/generator`'s
 * `buildManifest` applies `PREREGISTRATION.md §9` step 5's two seal checks — the
 * frozen `§4.1` composition and the 10,000-20,000 record band — and throws
 * `SEAL FAILURE` on either. Neither check is re-implemented here.
 *
 * **Everything this command decides is a digest or a path.** The four artifact
 * hashes are `sha256` over the committed bytes, so `EVALUATION_SPEC.md §7`'s
 * reproducibility guarantee is checkable with `sha256sum`; `constraint_set_hash`
 * is the digest of `packages/domain`'s canonical serialization. `families` is
 * `familiesFor(seed)` — `PREREGISTRATION.md §6.1`'s split table, read from the
 * package that holds it, never from a flag.
 *
 * **The two commits and the signature are arguments, not derived.** This
 * process does not shell out to `git`: `ARCHITECTURE.md §3` gives `apps/cli`
 * filesystem I/O and nothing about spawning, and a commit SHA read by running a
 * subprocess is a fact about the working tree rather than about the sealed
 * artifact. `PREREGISTRATION.md §9`'s procedure supplies both.
 *
 * **Ground truth is read in zone `GENERATOR_TRUST`.** `AL2` bars the engine and
 * the oracle from the artifact; the seal is neither, and `ARCHITECTURE.md §10`
 * places this work *"inside the generator's trust zone, offline, before any
 * agent exists"*. Under `--sealed` the guard withdraws that unlock, so
 * `assay seal --sealed` is refused by `AL5` rather than silently hashing a file
 * the flag exists to keep out of the output.
 *
 * **The recon report is read in zone `SEAL`, and that is a different zone on
 * purpose.** `§9` step 4 hashes `recon_report.jsonl` and step 5 makes its
 * absence a **SEAL FAILURE**, so this command has to be able to open it; `AL8`
 * bars **engine and oracle** code and the seal is neither (spec 1.4.24, M38),
 * and *"hashing is not reachability — the seal spends no `P_max`, runs before
 * any agent exists, and a SHA-256 digest carries no `constituent_entity_id` into
 * any decision"*. The zone is deliberately **not** `GENERATOR_TRUST`:
 * `DECISION_BRIEF.md §A.31` rejected widening that zone because it is claimed by
 * the `§5.3` completeness gate as well, and `§5.3` / `§10` V22 require the gate
 * never to hold the report. `AL5` does not withdraw this unlock — it is scoped
 * to ground-truth fields, and `§6.2` gives the report `settlement_id`,
 * `entity_id` and `settled_at` and *"nothing else"*.
 *
 * **One manifest per `(split, seed)`, ratified at spec 1.4.27 (`DATA_MODEL.md
 * §22.2` M42).** `seeds` was already the singleton `familiesFor(seed)` implies
 * and `record_counts` already that seed's families; what M42 adds is that this is
 * the **unit**, not a convenience. `--recon-report` names
 * `bench/<split>/recon_report.jsonl`, which is **split-scoped and does not
 * move** — so `recon_report_sha256` is identical across every manifest of one
 * split, by construction rather than by a check. The file is written as
 * `benchmark_manifest.json`, `PREREGISTRATION.md §9` step 5's and
 * `DECISION_BRIEF.md §K`'s own name for it.
 *
 * **`seal_signature` carries `§9` step 1's tag, checked from spec 1.4.29 (M45,
 * M46).** `DATA_MODEL.md §18` has typed the field *"signed git tag name"* since
 * the manifest existed, and nothing checked it: a manifest could record any
 * string, including the `bench-v1.0.6` that `§9`'s own text still named three
 * amendments after the benchmark moved to 1.0.7. A non-null `--seal-signature`
 * must now equal `bench-v<BENCHMARK_VERSION>`, derived from the constant rather than
 * transcribed. **Null is unchanged** — `§9` step 5 admits an unsealed manifest.
 * This verifies a *name*, not a *tag*: no subprocess is run and no git state is
 * read, exactly as this command's own rule below requires.
 *
 * **A passing `§5.3` completeness gate is a seal precondition, from spec 1.4.27
 * (M43).** `§9` step 3 has always said *"Step 3 is a gate, not a formality"*, and
 * through spec 1.4.26 nothing checked that it had run: this command read no gate
 * result, so a seal taken without step 3 was indistinguishable from one taken
 * after it. `--oracle-gate` names `bench/<split>/<seed>/oracle_gate.json` and a
 * missing or failing artifact is a **SEAL FAILURE** alongside `§9` step 5's
 * existing three. Sequencing is a procedure; a precondition is a control.
 */

const MANIFEST = "benchmark_manifest.json";

/** `§9` step 5's fourth seal failure, added at spec 1.4.27 (M43). */
export class SealGateFailure extends CliError {
  constructor(detail: string) {
    super(
      `SEAL FAILURE: ${detail} PREREGISTRATION.md §9 step 3 makes the §5.3 completeness gate ` +
        `a gate rather than a formality — "if the oracle cannot recover the true allocation ` +
        `for every target, the constraint set is wrong and nothing downstream is trustworthy" ` +
        `— and step 5 (spec 1.4.27, M43) refuses a manifest without a passing one.`,
      EXIT.FAILURE,
    );
    this.name = "SealGateFailure";
  }
}

function readUnixSeconds(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new UsageError(`--${flag} must be positive integer Unix seconds (DATA_MODEL.md §0 rule 2).`);
  }
  return value;
}

async function run(context: CommandContext): Promise<void> {
  const seedRaw = requireFlag(context.args, "seed");
  const seed = Number(seedRaw);
  if (!Number.isInteger(seed) || seed <= 0) {
    throw new UsageError(`--seed must be a positive integer; received ${JSON.stringify(seedRaw)}.`);
  }

  const observationsPath = requireFlag(context.args, "observations");
  const groundTruthPath = requireFlag(context.args, "ground-truth");
  const oracleLabelsPath = requireFlag(context.args, "oracle-labels");
  const reconReportPath = requireFlag(context.args, "recon-report");
  const outDir = stringFlag(context.args, "out") ?? ".";

  const createdAtFlag = stringFlag(context.args, "created-at");
  const sealedAtFlag = stringFlag(context.args, "sealed-at");
  const signature = stringFlag(context.args, "seal-signature");
  // M45 clause 4: this is where the operator's `--seal-tag` attestation lands.
  // `DATA_MODEL.md §18` already types the field "signed git tag name", so the
  // only thing added here is that a non-null value must actually be that name.
  // Null is untouched -- `§9` step 5 admits an unsealed manifest and says so.
  if (signature !== null) checkSealTag(signature, "seal-signature");

  const policy = { sealed: context.config.sealed };

  // Before anything is hashed: a seal that computed five digests and then
  // refused would leave a reader wondering which half to trust.
  const gatePath = requireFlag(context.args, "oracle-gate");
  let gate: unknown;
  try {
    gate = JSON.parse(readText({ path: gatePath, zone: "GENERATOR_TRUST", policy }));
  } catch (cause) {
    throw new SealGateFailure(
      `cannot read the §5.3 gate artifact at ${JSON.stringify(gatePath)}: ` +
        `${cause instanceof Error ? cause.message : String(cause)}.`,
    );
  }
  if (!gateArtifactPasses(gate)) {
    throw new SealGateFailure(
      `the gate artifact at ${JSON.stringify(gatePath)} does not record a passing completeness ` +
        `gate. Run \`assay oracle --split <split> --seeds <seed>\` and resolve the failure ` +
        `before sealing; the gate is not waived by re-running the seal.`,
    );
  }

  const manifest = buildManifest({
    created_at:
      createdAtFlag === null
        ? Math.floor(Date.now() / 1000)
        : readUnixSeconds(createdAtFlag, "created-at"),
    generator_commit: requireFlag(context.args, "generator-commit"),
    spec_commit: requireFlag(context.args, "spec-commit"),
    families: familiesFor(seed),
    seeds: [seed],
    observations_sha256: sha256Text(
      readText({ path: observationsPath, zone: "AGENT", policy }),
    ),
    ground_truth_sha256: sha256Text(
      readText({ path: groundTruthPath, zone: "GENERATOR_TRUST", policy }),
    ),
    oracle_labels_sha256: sha256Text(
      readText({ path: oracleLabelsPath, zone: "AGENT", policy }),
    ),
    recon_report_sha256: sha256Text(
      readText({ path: reconReportPath, zone: "SEAL", policy }),
    ),
    constraint_set_hash: sha256Text(canonicalConstraintSet()),
    sealed_at: sealedAtFlag === null ? null : readUnixSeconds(sealedAtFlag, "sealed-at"),
    seal_signature: signature,
  });

  context.sink.write(join(outDir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  context.out(`benchmark_version   ${BENCHMARK_VERSION}`);
  context.out(`gt_version          ${GT_VERSION}`);
  context.out(`families            ${manifest.families.join(", ")}`);
  context.out(`constraint_set_hash ${manifest.constraint_set_hash}`);
  context.out(`observations_sha256 ${manifest.observations_sha256}`);
  // Echoed beside observations because §9 step 5 makes its absence a SEAL
  // FAILURE and step 4 is a manual `sha256` an operator checks by eye. A digest
  // is not a ground-truth field and carries no constituent identifier (M38), so
  // printing it is not an AL5 question.
  context.out(`recon_report_sha256 ${manifest.recon_report_sha256}`);
  // M43: printed so the seal names the gate it was permitted by. The artifact
  // is not hashed into the manifest -- it is a build product, not a benchmark
  // surface -- so this line is its only appearance in the seal's output.
  context.out(`oracle_gate         PASS (${gatePath})`);
  context.out(`sealed_at           ${manifest.sealed_at === null ? "(not sealed)" : String(manifest.sealed_at)}`);
}

export const sealCommand: Command = {
  name: "seal",
  summary: "Hash the committed artifacts and write BenchmarkManifest (PREREGISTRATION.md §9).",
  flags: {
    seed: { kind: "string", describe: "A seed declared in PREREGISTRATION.md §6.1." },
    observations: { kind: "string", describe: "Path to the committed observations.jsonl." },
    "ground-truth": { kind: "string", describe: "Path to the committed ground_truth.jsonl." },
    "oracle-labels": { kind: "string", describe: "Path to the committed ambiguity_labels.jsonl." },
    "recon-report": { kind: "string", describe: "Path to the split-scoped recon_report.jsonl (§9 step 4)." },
    "oracle-gate": { kind: "string", describe: "Path to this (split, seed)'s oracle_gate.json (§9 step 5, M43)." },
    "generator-commit": { kind: "string", describe: "Commit SHA of the generator (§9)." },
    "spec-commit": { kind: "string", describe: "Commit SHA of the specification (§9)." },
    "created-at": { kind: "string", describe: "Unix seconds. Default: the wall clock." },
    "sealed-at": { kind: "string", describe: "Unix seconds. Omit for an unsealed manifest." },
    "seal-signature": { kind: "string", describe: `§9 step 1's signed tag (${SEAL_TAG}). Omit for unsealed.` },
    out: { kind: "string", describe: "Directory to write manifest.json into. Default: ." },
  },
  run,
};
