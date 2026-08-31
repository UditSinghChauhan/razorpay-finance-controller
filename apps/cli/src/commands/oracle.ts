import { drawPairs, consistencyGate } from "@assay/eval";
import { blockOf, SPEC_VERSION, type Split } from "@assay/generator";
import { completenessGate, labelAll, oracleContext } from "@assay/oracle";

import { requireFlag, requireSeeds, stringFlag } from "../args.js";
import { decodeJsonl, encodeJsonl } from "../artifacts/jsonl.js";
import { loadObservations } from "../artifacts/observations.js";
import {
  encodeGateReport, readTruthRow, redactForSplit, trueAllocations,
  type ConsistencyReport, type OracleGateReport,
} from "../artifacts/gate.js";
import { CliError, EXIT, UsageError } from "../errors.js";
import { join } from "../fs/io.js";
import type { Command, CommandContext } from "./types.js";

/**
 * `assay oracle` — label a dataset and run `PREREGISTRATION.md §5.3`'s gates.
 *
 * `ARCHITECTURE.md §10`: `oracle ◀── observations ONLY ──▶ oracle_labels.jsonl`,
 * `+ completeness gate (vs ground truth, offline)`, `+ consistency gate (vs
 * engine, differential)`. `packages/oracle`'s header states the split this
 * command sits on: *"**This package performs no I/O.** It takes an observation
 * set as data and returns labels as data … `apps/cli` performs the read."*
 *
 * **This command runs both gates from spec 1.4.27 (`DATA_MODEL.md §22.2` M43),
 * and holds neither.** `§5.3` calls them *"hard build gates"* and `§9` step 3
 * calls the completeness gate *"a gate, not a formality"*; through spec 1.4.26 no
 * command could invoke either, so a MUST-PASS control existed only in prose. The
 * implementations do not move: `completenessGate` stays in `packages/oracle` and
 * `consistencyGate` in `packages/eval`, both pure functions over data this
 * command supplies. `ARCHITECTURE.md §3` gives `apps/cli` *"all filesystem I/O"*
 * and neither package performs any, so the caller was always going to be here.
 *
 * ```
 *   --split dev    labels + completeness + consistency    EVALUATION_SPEC.md §7
 *   --split test   labels + completeness ONLY             PREREGISTRATION.md §9 step 3
 * ```
 *
 * **The asymmetry is derived, not chosen.** `§5.3` and `ARCHITECTURE.md §7.3`
 * scope the consistency gate to *"pairs drawn from the **dev split**"* — a build
 * gate — while the completeness gate *"runs on every dataset before any agent
 * sees it"* and `§9` step 3 makes it a seal gate. Both documents already spelled
 * it: `§7` writes *"# gates must pass"* for dev and `§9` step 3 *"# completeness
 * gate MUST pass"* for test.
 *
 * **Access.** Observations are read in zone `AGENT`, so the guard refuses
 * `recon_report*.jsonl` and `ground_truth*.jsonl` on that path. Ground truth is
 * read in `GENERATOR_TRUST`, the route `AL2` has permitted since `apps/cli`
 * landed, and `AL5` withdraws it under `--sealed` — so neither gate runs sealed,
 * and `§9` step 3 correctly carries no such flag. **The recon report reaches
 * neither gate**: `AL8` says its seal-scoped permission *"does not extend to the
 * `§5.3` completeness gate, which stays observations-only"*, and `§10` V22 rests
 * on that. **The consistency gate never receives ground truth** — it is handed
 * observations and pairs, and nothing else.
 *
 * **On `test` the output is aggregate only.** `AL4` bars inspection of TEST
 * outputs before the sealed run and `AL7` burns the seed on a breach, so
 * `artifacts/gate.ts` drops every per-target record for that split and this
 * command prints counts.
 *
 * **The differential draw's seed is an operator input.** `§7` freezes
 * `R = 20,000` and freezes no sampler and no seed; spec 1.4.27 resolved neither
 * and recorded the gap as `§10` V24. Deriving one from the dataset seed would
 * have been a choice made silently because a candidate happened to be
 * deterministic. So `--consistency-seed` is **required on dev** and the command
 * fails closed without it, rather than inventing the parameter this repository
 * declined to freeze.
 */

const OBSERVATIONS = "observations.jsonl";
const GROUND_TRUTH = "ground_truth.jsonl";
const ORACLE_LABELS = "oracle_labels.jsonl";
const ORACLE_GATE = "oracle_gate.json";

/** Raised when a `§5.3` gate fails. Distinct so a harness can tell it from a crash. */
export class GateFailedError extends CliError {
  constructor(message: string) {
    super(message, EXIT.FAILURE);
    this.name = "GateFailedError";
  }
}

function readSplit(raw: string): Split {
  if (raw === "train" || raw === "dev" || raw === "test") return raw;
  throw new UsageError(`--split must be train, dev or test; received ${JSON.stringify(raw)}.`);
}

/** `§6.1`'s split table is the sole authority; `blockOf` is its only reader. */
function checkSeed(seed: number, split: Split): void {
  const block = blockOf(seed);
  if (block === null) {
    throw new UsageError(
      `seed ${String(seed)} appears in no row of PREREGISTRATION.md §6.1's split table.`,
    );
  }
  if (block.split !== split) {
    throw new UsageError(
      `PREREGISTRATION.md §6.1 assigns seed ${String(seed)} to the ${block.split} split, not ` +
        `${split}. The split table is frozen and is not overridden from the command line.`,
    );
  }
}

/**
 * `§5.3`: the differential sample is drawn *"from the dev split"*.
 *
 * A property of the split and not a flag, so no invocation can move a build gate
 * onto the sealed data or take it off dev.
 */
function runsConsistencyGate(split: Split): boolean {
  return split === "dev";
}

async function run(context: CommandContext): Promise<void> {
  const split = readSplit(requireFlag(context.args, "split"));
  const seeds = requireSeeds(context.args);
  const benchRoot = stringFlag(context.args, "bench") ?? "bench";
  const drawSeedRaw = stringFlag(context.args, "consistency-seed");

  for (const seed of seeds) checkSeed(seed, split);

  if (runsConsistencyGate(split) && drawSeedRaw === null) {
    throw new UsageError(
      `--consistency-seed is required on the dev split. PREREGISTRATION.md §5.3 makes the ` +
        `R = 20,000 differential test a hard build gate, and §7 freezes R while freezing NO ` +
        `sampler and NO seed (§10 V24, spec 1.4.27). Deriving one from the dataset seed would ` +
        `be a choice made silently because a candidate happened to be deterministic, so this ` +
        `command fails closed instead. Supply a seed; it is recorded in oracle_gate.json.`,
    );
  }
  const drawSeed = drawSeedRaw === null ? null : Number(drawSeedRaw);
  if (drawSeed !== null && (!Number.isSafeInteger(drawSeed) || drawSeed <= 0)) {
    throw new UsageError(`--consistency-seed must be a positive integer.`);
  }

  const policy = { sealed: context.config.sealed };
  const failures: string[] = [];

  for (const seed of seeds) {
    const seedDir = join(join(benchRoot, split), String(seed));
    const observations = loadObservations(join(seedDir, OBSERVATIONS), policy);

    // Everything below the read is packages/oracle's. `oracleContext` builds
    // C2's referent set — including DATA_MODEL.md §22.2 M22's "the recon_line
    // governs" precedence and §4.2's F05 case — and `labelAll` enumerates,
    // decomposes and classifies. An invented reading would be compared against
    // the engine's declared one and the gate would report a divergence between
    // the oracle and its own caller.
    const oracleRun = labelAll(observations, oracleContext(observations));
    context.sink.write(join(seedDir, ORACLE_LABELS), encodeJsonl(oracleRun.labels));

    // AL2's route, and the only one. AL5 withdraws it under --sealed, which is
    // why §9 step 3 carries no such flag.
    const truth = decodeJsonl(
      { path: join(seedDir, GROUND_TRUTH), zone: "GENERATOR_TRUST", policy },
      { parse: readTruthRow },
    );
    const completeness = completenessGate(
      oracleRun.results,
      trueAllocations(truth, observations),
    );

    let consistency: ConsistencyReport | null = null;
    if (runsConsistencyGate(split) && drawSeed !== null) {
      const pairs = drawPairs(observations, drawSeed);
      const result = consistencyGate(observations, pairs);
      consistency = Object.freeze({
        passed: result.passed,
        sample_size: result.sample_size,
        meets_declared_sample_size: result.meets_declared_sample_size,
        draw_seed: drawSeed,
        by_clause: result.by_clause,
        divergences: result.divergences,
        admissibility_divergences: result.admissibility_divergences,
      });
    }

    const passed = completeness.passed && (consistency === null || consistency.passed);
    const report: OracleGateReport = Object.freeze({
      spec_version: SPEC_VERSION,
      split,
      seed,
      passed,
      completeness: redactForSplit(completeness, split),
      consistency,
    });
    context.sink.write(join(seedDir, ORACLE_GATE), encodeGateReport(report));

    const counts = new Map<string, number>();
    for (const label of oracleRun.labels) {
      counts.set(label.label, (counts.get(label.label) ?? 0) + 1);
    }

    context.out(`${split} seed ${String(seed)}`);
    context.out(`  observations      ${String(observations.length)}`);
    context.out(`  targets           ${String(oracleRun.labels.length)}`);
    // Sorted, because DATA_MODEL.md §16 bars a reported result that depends on
    // "iteration order over an unordered collection" and a Map preserves
    // insertion order, which is the enumeration's, not a stable one.
    for (const [label, count] of [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      context.out(`    ${label.padEnd(18)}${String(count)}`);
    }
    // Counts only, on every split. AL4 permits inspecting train/dev without
    // limit, but a stdout line is not the artifact and there is no reason for
    // the two to diverge; the findings live in oracle_gate.json where §5.3 puts
    // them.
    context.out(
      `  completeness      ${completeness.passed ? "PASS" : "FAIL"}  ` +
        `in-scope ${String(completeness.targets_in_scope)}/${String(completeness.targets_total)}, ` +
        `inexpressible ${String(completeness.scoped_out_inexpressible)}, ` +
        `budget ${String(completeness.scoped_out_budget_exhausted)}, ` +
        `failures ${String(completeness.failures.length)}`,
    );
    if (consistency === null) {
      context.out(`  consistency       not run (§5.3 draws from the dev split)`);
    } else {
      context.out(
        `  consistency       ${consistency.passed ? "PASS" : "FAIL"}  ` +
          `${String(consistency.sample_size)} pairs at draw seed ${String(consistency.draw_seed)}` +
          `${consistency.meets_declared_sample_size ? "" : " (BELOW declared R)"}`,
      );
    }
    context.out(`  gate              ${join(seedDir, ORACLE_GATE)}`);

    if (!passed) failures.push(`${split}/${String(seed)}`);
  }

  if (failures.length > 0) {
    throw new GateFailedError(
      `PREREGISTRATION.md §5.3 gate failed on ${failures.join(", ")}. §9 step 3: "if the oracle ` +
        `cannot recover the true allocation for every target, the constraint set is wrong and ` +
        `nothing downstream is trustworthy." No seal may be taken from this dataset.`,
    );
  }
}

export const oracleCommand: Command = {
  name: "oracle",
  summary: "Label ambiguity and run the §5.3 gates (observations only; ground truth for completeness).",
  flags: {
    split: { kind: "string", describe: "train | dev | test (PREREGISTRATION.md §6.1)." },
    seeds: { kind: "string", describe: "Declared seeds: \"2000-2004\" or \"9000-9004,9100-9104\"." },
    seed: { kind: "string", describe: "One declared seed; the one-element case of --seeds." },
    bench: { kind: "string", describe: "Benchmark root. Default: bench" },
    "consistency-seed": {
      kind: "string",
      describe: "Seed for the §5.3 differential draw. Required on dev; NOT frozen (§10 V24).",
    },
  },
  run,
};
