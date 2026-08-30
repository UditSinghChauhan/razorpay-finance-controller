import { canonicalConstraintSet } from "@assay/domain";
import { buildManifest, familiesFor, BENCHMARK_VERSION, GT_VERSION } from "@assay/generator";

import { requireFlag, stringFlag } from "../args.js";
import { UsageError } from "../errors.js";
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
 */

const MANIFEST = "manifest.json";

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

  const policy = { sealed: context.config.sealed };

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
    "recon-report": { kind: "string", describe: "Path to the committed recon_report.jsonl (§9 step 4)." },
    "generator-commit": { kind: "string", describe: "Commit SHA of the generator (§9)." },
    "spec-commit": { kind: "string", describe: "Commit SHA of the specification (§9)." },
    "created-at": { kind: "string", describe: "Unix seconds. Default: the wall clock." },
    "sealed-at": { kind: "string", describe: "Unix seconds. Omit for an unsealed manifest." },
    "seal-signature": { kind: "string", describe: "§9's seal signature." },
    out: { kind: "string", describe: "Directory to write manifest.json into. Default: ." },
  },
  run,
};
