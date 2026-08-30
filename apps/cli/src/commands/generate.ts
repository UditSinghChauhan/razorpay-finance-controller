import { familiesFor, generateFamily, blockOf, type Split } from "@assay/generator";

import { requireFlag, stringFlag } from "../args.js";
import { UsageError } from "../errors.js";
import { encodeJsonl } from "../artifacts/jsonl.js";
import { join } from "../fs/io.js";
import type { Command, CommandContext } from "./types.js";

/**
 * `assay generate` — the benchmark's forward simulation, written to disk.
 *
 * `packages/generator`'s header states the split this command is the other half
 * of: *"**This package writes no file.** `assay generate` belongs to
 * `apps/cli`."* So the simulation, the ground truth, the degradation layer and
 * every frozen count are `packages/generator`'s, and the only things below are
 * argument handling, serialization and the write.
 *
 * **`--split test` is refused.** `PREREGISTRATION.md §6.1` holds the test split
 * until the seal and `§9` sequences its generation *after* the seal tag; `AL7`
 * burns a seed on any breach. Whether the seal tag exists is a fact about the
 * repository that this process cannot establish, and a command that guessed
 * would guess in the direction that costs a seed. It therefore fails closed and
 * names the procedure instead.
 *
 * **The `§6.2` probe surface is not produced, and cannot be from here.**
 * `ARCHITECTURE.md §3` assigns *"the PG-side recon report `§6.2`'s probe reads
 * (spec 1.4.22)"* to `packages/generator`, and `RECONCILIATION_SPEC.md §6.2`
 * fixes its content — *"one row per `ReconLine` the simulation produced,
 * carrying `settlement_id`, `entity_id` and `settled_at` and **nothing
 * else**"*. No such emitter exists in that package. Deriving the rows here
 * would mean reconstructing, in `apps/cli`, an artifact whose defining property
 * is that `PREREGISTRATION.md §4.2`'s `F05` withholds a constituent from the
 * observation set but **not** from the report — that is simulation state, and
 * `apps/cli` does not hold it. The command reports the gap and writes what the
 * generator does produce.
 */

const OBSERVATIONS = "observations.jsonl";
const GROUND_TRUTH = "ground_truth.jsonl";
const UNTRUSTED_TEXT = "untrusted_text.jsonl";

function readSplit(raw: string): Split {
  if (raw === "train" || raw === "dev") return raw;
  if (raw === "test") {
    throw new UsageError(
      `--split test is refused. PREREGISTRATION.md §6.1 holds the test split until the seal ` +
        `and §9 sequences its generation after the seal tag; AL7 burns a seed on any breach. ` +
        `This process cannot establish whether the tag exists, so it declines rather than ` +
        `guessing in the direction that costs a seed.`,
    );
  }
  throw new UsageError(`--split must be train or dev; received ${JSON.stringify(raw)}.`);
}

function readSeed(raw: string): number {
  const seed = Number(raw);
  if (!Number.isInteger(seed) || seed <= 0) {
    throw new UsageError(`--seed must be a positive integer; received ${JSON.stringify(raw)}.`);
  }
  return seed;
}

async function run(context: CommandContext): Promise<void> {
  const split = readSplit(requireFlag(context.args, "split"));
  const seed = readSeed(requireFlag(context.args, "seed"));
  const outRoot = stringFlag(context.args, "out") ?? "bench";

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

  const dir = join(join(outRoot, split), String(seed));

  for (const family of familiesFor(seed)) {
    // `allow_declared_seed` is passed because this is the caller
    // packages/generator names for it: "a caller that genuinely means to build a
    // split — apps/cli's `assay generate` at seal time — passes this explicitly".
    const generated = generateFamily(family, seed, { allow_declared_seed: true });
    const familyDir = join(dir, family);

    context.sink.write(join(familyDir, OBSERVATIONS), encodeJsonl(generated.observations));
    context.sink.write(join(familyDir, UNTRUSTED_TEXT), encodeJsonl(generated.untrusted_text));
    context.sink.write(join(familyDir, GROUND_TRUTH), encodeJsonl([generated.ground_truth]));

    context.out(
      `${family} seed ${String(seed)}  ${String(generated.observations.length)} observations, ` +
        `${String(generated.untrusted_text.length)} quarantined text rows`,
    );
  }

  context.out(
    `BLOCKED: recon_report.jsonl was not written. ARCHITECTURE.md §3 assigns the PG-side ` +
      `recon report to packages/generator and no emitter exists there, so ` +
      `RECONCILIATION_SPEC.md §6.2's fetch_settlement_recon has no surface on this dataset.`,
  );
}

export const generateCommand: Command = {
  name: "generate",
  summary: "Run the forward simulation for one declared seed and write its artifacts.",
  flags: {
    seed: { kind: "string", describe: "A seed declared in PREREGISTRATION.md §6.1." },
    split: { kind: "string", describe: "train | dev. test is held until the seal (§6.1)." },
    out: { kind: "string", describe: "Output root. Default: bench" },
  },
  run,
};
