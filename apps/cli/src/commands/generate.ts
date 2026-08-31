import {
  SEED_BLOCKS, blockOf, buildDataset, mergeReconReports,
  type GeneratedDataset, type Split,
} from "@assay/generator";

import { requireFlag, requireSeeds, stringFlag } from "../args.js";
import { UsageError } from "../errors.js";
import { encodeJsonl } from "../artifacts/jsonl.js";
import { join } from "../fs/io.js";
import { SEAL_TAG, checkSealTag } from "../seal-tag.js";
import type { Command, CommandContext } from "./types.js";

/**
 * `assay generate` — the benchmark's forward simulation, written to disk.
 *
 * `packages/generator`'s header states the split this command is the other half
 * of: *"**This package writes no file.** `assay generate` belongs to
 * `apps/cli`."* So the simulation, the ground truth, the degradation layer, the
 * frozen counts **and the aggregation** are `packages/generator`'s, and the only
 * things below are argument handling, serialization and the write.
 *
 * **The dataset unit is `(split, seed)`, ratified at spec 1.4.27
 * (`DATA_MODEL.md §22.2` M42).** `PREREGISTRATION.md §4.1` has defined a dataset
 * that way since benchmark v1.0.1 and `EVALUATION_SPEC.md §2` scores that way;
 * **family is a composition dimension and never a file dimension**, so a seed's
 * families are concatenated into one set of artifacts rather than written per
 * family. `buildDataset` performs that concatenation — F01..F10 ascending, each
 * family's own row order preserved, `source_line` re-based — because
 * `ARCHITECTURE.md §3` bars this package from performing an `S0` transform and
 * `RECONCILIATION_SPEC.md §2` step 5 makes provenance stamping `S0`'s. Nothing
 * about the arrangement is decided here.
 *
 * ```
 *   <out>/<split>/<seed>/observations.jsonl      dataset artifacts, (split, seed)
 *   <out>/<split>/<seed>/untrusted_text.jsonl
 *   <out>/<split>/<seed>/ground_truth.jsonl
 *   <out>/<split>/recon_report.jsonl             §6.2 probe surface, SPLIT-scoped
 * ```
 *
 * **`--split test` is refused until the operator attests to the seal tag**
 * (spec 1.4.29, `DATA_MODEL.md §22.2` M45). `PREREGISTRATION.md §6.1` holds the
 * test split *"before the seal"*, and M45 settles what that phrase bounds: **the
 * seal is `§9` step 1's signed tag**, and step 6's commit SHA is the seal
 * *point* — the provenance record, not the access boundary. Through spec 1.4.28
 * the two readings coexisted and `§9` forbade its own step 2.
 *
 * Whether the tag exists remains a fact this process cannot establish — it runs
 * no subprocess, `eslint.config.js` bans every transport here, and
 * `commands/seal.ts` gives the reason it does not shell out to `git`. So the
 * command still **fails closed**, and what lifts it is the operator's
 * attestation `--seal-tag bench-v<BENCHMARK_VERSION>` and nothing else: absent,
 * the refusal is
 * exactly the spec-1.4.28 refusal and `AL7` still burns a seed on the breach.
 * `../seal-tag.ts` holds M45's five clauses. **Spec 1.4.27 did not lift this**
 * — it settled the artifact unit, not the sequence.
 *
 * **The `§6.2` probe surface is written once per split and decided elsewhere.**
 * `ARCHITECTURE.md §3` assigns *"the PG-side recon report `§6.2`'s probe reads
 * (spec 1.4.22)"* to `packages/generator`, and M36 scopes it to the split. M42
 * leaves it exactly there: it is *"never an `Observation`, and never ingested"*
 * and `settlement_id`, its only query key, is unique across every family and
 * seed — a lookup table has nothing to partition. `mergeReconReports` orders the
 * merged rows `entity_id` ascending, which is M38's order holding over the file
 * it was always for, and this command **re-orders nothing**:
 * `artifacts/jsonl.ts` states the rule it obeys, that *"the ordering that matters
 * is the ordering the producing package chose"*.
 */

const OBSERVATIONS = "observations.jsonl";
const GROUND_TRUTH = "ground_truth.jsonl";
const UNTRUSTED_TEXT = "untrusted_text.jsonl";
const RECON_REPORT = "recon_report.jsonl";

function readSplit(raw: string): Split {
  if (raw === "train" || raw === "dev" || raw === "test") return raw;
  throw new UsageError(
    `--split must be train, dev or test; received ${JSON.stringify(raw)}.`,
  );
}

/**
 * `§6.1`'s bar on `--split test`, and `M45`'s attestation.
 *
 * Split from {@link readSplit} because they answer different questions: one asks
 * whether a split *exists*, the other whether this invocation is *permitted*.
 * Folding them would make the refusal look like a parse failure, and `AL7` burns
 * a seed on the difference.
 *
 * @throws UsageError when `test` is named without a correct attestation, or when
 *   an attestation is supplied for a split that does not need one.
 */
function checkSealAttestation(split: Split, attested: string | null): void {
  if (split !== "test") {
    if (attested === null) return;
    throw new UsageError(
      `--seal-tag is valid only with --split test (spec 1.4.29, register row M45). ` +
        `PREREGISTRATION.md §6.1 bars no other split, so an attestation here would assert ` +
        `something nothing asked for -- and a flag that is inert on the common path is a ` +
        `flag that stays in a script until the day it is not inert.`,
    );
  }
  if (attested === null) {
    throw new UsageError(
      `--split test is refused. PREREGISTRATION.md §6.1 holds the test split until the seal, ` +
        `and spec 1.4.29 (register row M45) settles that "the seal" is §9 step 1's signed tag ` +
        `-- step 6's commit SHA is the seal POINT, not the boundary. This process cannot ` +
        `establish whether that tag exists: it runs no subprocess and reads no git state, and ` +
        `a command that guessed would guess in the direction that costs a seed. Take §9 step 1, ` +
        `then attest to it: --seal-tag ${SEAL_TAG}. Until then AL7 stays in force and this ` +
        `invocation would itself be a §6.1 forbidden-list breach.`,
    );
  }
  checkSealTag(attested, "seal-tag");
}

/**
 * What `--seeds all` expands to for one split (`§9` step 7's spelling).
 *
 * Read from `SEED_BLOCKS` rather than listed, for the same reason `checkSeed`
 * gives below: `§6.1`'s table is frozen and has one reader. `test` spans two
 * blocks — `9000-9004` and `9100-9104` — so this is a filter and not a lookup.
 */
function declaredSeeds(split: Split): readonly number[] {
  return SEED_BLOCKS.filter((block) => block.split === split).flatMap((block) => [...block.seeds]);
}

/**
 * `§6.1`'s split table is the sole authority on which seeds exist and where.
 *
 * Checked here rather than in the parser for the reason `args.ts` gives: a parser
 * that also validated would be a second place the frozen table is interpreted.
 */
function checkSeed(seed: number, split: Split): void {
  const block = blockOf(seed);
  if (block === null) {
    throw new UsageError(
      `seed ${String(seed)} appears in no row of PREREGISTRATION.md §6.1's split table. ` +
        `A benchmark dataset is generated only at a declared seed.`,
    );
  }
  if (block.split !== split) {
    throw new UsageError(
      `PREREGISTRATION.md §6.1 assigns seed ${String(seed)} to the ${block.split} split, not ` +
        `${split}. The split table is frozen and is not overridden from the command line.`,
    );
  }
}

async function run(context: CommandContext): Promise<void> {
  const split = readSplit(requireFlag(context.args, "split"));
  const attested = stringFlag(context.args, "seal-tag");
  checkSealAttestation(split, attested);

  const seeds = requireSeeds(context.args, declaredSeeds(split));
  const outRoot = stringFlag(context.args, "out") ?? "bench";

  if (attested !== null) {
    // Echoed so the operator's assertion appears in the run log beside the data
    // it authorised. `assay seal --seal-signature` records the same value in
    // `BenchmarkManifest.seal_signature`, which `DATA_MODEL.md §18` already
    // types "signed git tag name" (M45 clause 4). No field is added anywhere.
    context.out(
      `seal attestation  ${attested}  (operator-asserted, not verified; §9 step 1, M45)`,
    );
  }

  for (const seed of seeds) checkSeed(seed, split);

  const splitDir = join(outRoot, split);
  const datasets: GeneratedDataset[] = [];

  for (const seed of seeds) {
    // `allow_declared_seed` is passed because this is the caller
    // packages/generator names for it: "a caller that genuinely means to build a
    // split — apps/cli's `assay generate` at seal time — passes this explicitly".
    const dataset = buildDataset(seed, { allow_declared_seed: true });
    datasets.push(dataset);

    const seedDir = join(splitDir, String(seed));
    context.sink.write(join(seedDir, OBSERVATIONS), encodeJsonl(dataset.observations));
    context.sink.write(join(seedDir, UNTRUSTED_TEXT), encodeJsonl(dataset.untrusted_text));
    context.sink.write(join(seedDir, GROUND_TRUTH), encodeJsonl(dataset.ground_truth));

    context.out(
      `${split} seed ${String(seed)}  ${dataset.families.join(",")}  ` +
        `${String(dataset.observations.length)} observations, ` +
        `${String(dataset.untrusted_text.length)} quarantined text rows, ` +
        `${String(dataset.ground_truth.length)} ground-truth records`,
    );
  }

  // Once per split, from every seed this invocation generated. §9 step 2 covers
  // a split in one command, which is why one file can hold the whole surface.
  const report = mergeReconReports(datasets);
  context.sink.write(join(splitDir, RECON_REPORT), encodeJsonl(report));
  context.out(`${split} recon_report  ${String(report.length)} rows (split-scoped, M36/M42)`);
}

export const generateCommand: Command = {
  name: "generate",
  summary: "Run the forward simulation for the declared seeds and write their artifacts.",
  flags: {
    seeds: {
      kind: "string",
      describe: "Declared seeds: \"2000-2004\", \"9000-9004,9100-9104\", or \"all\" (§9 step 7).",
    },
    seed: { kind: "string", describe: "One declared seed; the one-element case of --seeds." },
    split: { kind: "string", describe: "train | dev | test. test needs --seal-tag (§6.1, M45)." },
    "seal-tag": {
      kind: "string",
      describe: `Attest to §9 step 1's signed tag (${SEAL_TAG}). Required for --split test.`,
    },
    out: { kind: "string", describe: "Output root. Default: bench" },
  },
  run,
};
