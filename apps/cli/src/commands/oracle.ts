import { CONSISTENCY_DRAW_SEED, consistencyGate, drawPairs } from "@assay/eval";
import { SEED_BLOCKS, blockOf, SPEC_VERSION, type Split } from "@assay/generator";
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
 * landed. **The recon report reaches neither gate**: `AL8` says its seal-scoped
 * permission *"does not extend to the `§5.3` completeness gate, which stays
 * observations-only"*, and `§10` V22 rests on that. **The consistency gate never
 * receives ground truth** — it is handed observations and pairs, and nothing
 * else.
 *
 * **`--sealed` is refused outright, from spec 1.4.34 (`DATA_MODEL.md §22.2`
 * M56).** `§5.3` said *"`AL5` withdraws that route under `--sealed`"*, and
 * `fs/guard.ts` enforced it as a **read** refusal. `M56` rules `AL5` an
 * **emission** rule — *"reading is none of print, log or write"* — so the read
 * refusal is gone; the withdrawal `§5.3` wrote survives for this command, and is
 * re-grounded on a **flag refusal**, which `DECISION_BRIEF.md §A.41` records as
 * *stricter*: *"it cannot be reached by a gate call site that happens to open the
 * file"*. `§9` step 3 carries no such flag, so nothing in the official procedure
 * changes — an invocation that carries one was never `§9`'s and is now a usage
 * error rather than a run that opens the answer key and fails afterwards.
 *
 * **On `test` the output is aggregate only.** `AL4` bars inspection of TEST
 * outputs before the sealed run and `AL7` burns the seed on a breach, so
 * `artifacts/gate.ts` drops every per-target record for that split and this
 * command prints counts.
 *
 * **The differential draw is frozen, and this command supplies no part of it.**
 * Spec 1.4.27 made `--consistency-seed` **required on dev** because `§7` froze
 * `R` and nothing else; spec 1.4.28 (`DATA_MODEL.md §22.2` M44) freezes the whole
 * draw into `§7` — sampler and seed together, `CONSISTENCY_DRAW_SEED = 417203` —
 * so an official run needs no flag and takes none of its parameters from the
 * command line. `AL3` binds them.
 *
 * **The override survives, and it is non-authoritative.** `--consistency-seed`
 * now overrides the frozen seed **for local exploration only**: it is refused on
 * the test split — and this command admits no `--sealed` at all — it marks the
 * artifact
 * `authoritative: false`, and `oracle_gate.json` records both the seed used and
 * the frozen seed it departed from. `AL4` lets a developer inspect DEV *"without
 * limit"*, so exploring other draws is legitimate; what `AL3` forbids is choosing
 * **which run counts** after seeing it, and an artifact that cannot pass itself
 * off as official is what keeps those two apart.
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

/**
 * `§5.3`'s withdrawal, carried as a flag refusal — spec 1.4.34, `M56`.
 *
 * `§9` runs this command at step 3 and carries no `--sealed`. The refusal is a
 * **usage** error rather than a guard trip because nothing was read: the
 * invocation is malformed, and `EXIT.USAGE` is what a harness reads to tell a
 * bad command line from a breach `AL7` would burn a seed for.
 */
function refuseSealed(context: CommandContext): void {
  if (!context.config.sealed) return;
  throw new UsageError(
    `assay oracle takes no --sealed. PREREGISTRATION.md §5.3 withdraws ground truth from ` +
      `this gate under that flag, and from spec 1.4.34 (DATA_MODEL.md §22.2 M56) the ` +
      `withdrawal is carried by this refusal rather than by fs/guard.ts: AL5 is an EMISSION ` +
      `rule — "the CLI's --sealed flag refuses to print, log or write any ground-truth field" ` +
      `— so a read refusal would have made §9 step 7's scored sweep inexecutable, while a ` +
      `flag refusal cannot be reached by a gate call site that happens to open the file ` +
      `(DECISION_BRIEF.md §A.41). §9 step 3 invokes this command without the flag.`,
  );
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
  // Before any flag is read and before any path is formed: M56 re-grounds §5.3's
  // withdrawal on this refusal, and a refusal that let the flag reach a truth
  // read and failed afterwards would be the weaker construction it replaces.
  refuseSealed(context);

  const split = readSplit(requireFlag(context.args, "split"));
  // `--seeds all` (§9 step 7's spelling) expands over §6.1's declared seeds for
  // this split, read from the frozen table's one reader.
  const declared = SEED_BLOCKS.filter((b) => b.split === split).flatMap((b) => [...b.seeds]);
  const seeds = requireSeeds(context.args, declared);
  const benchRoot = stringFlag(context.args, "bench") ?? "bench";
  const drawSeedRaw = stringFlag(context.args, "consistency-seed");

  for (const seed of seeds) checkSeed(seed, split);

  // AL3 binds §7's draw from spec 1.4.28 (M44). An override is non-authoritative
  // and may never reach an official run. The `--sealed` half of that guard is
  // subsumed by `refuseSealed` above -- this command admits no such invocation at
  // all from spec 1.4.34 (M56) -- and the split half stands: the test split has
  // no consistency gate for an override to move.
  if (drawSeedRaw !== null && !runsConsistencyGate(split)) {
    throw new UsageError(
      `--consistency-seed is meaningless on the ${split} split: PREREGISTRATION.md §5.3 draws ` +
        `the differential sample from the dev split, so no consistency gate runs here.`,
    );
  }
  const override = drawSeedRaw === null ? null : Number(drawSeedRaw);
  if (override !== null && (!Number.isSafeInteger(override) || override <= 0)) {
    throw new UsageError(`--consistency-seed must be a positive integer.`);
  }
  // §7's frozen seed unless a non-authoritative override was given.
  const drawSeed = override ?? CONSISTENCY_DRAW_SEED;
  const authoritative = override === null;

  const failures: string[] = [];

  for (const seed of seeds) {
    const seedDir = join(join(benchRoot, split), String(seed));
    const observations = loadObservations(join(seedDir, OBSERVATIONS));

    // Everything below the read is packages/oracle's. `oracleContext` builds
    // C2's referent set — including DATA_MODEL.md §22.2 M22's "the recon_line
    // governs" precedence and §4.2's F05 case — and `labelAll` enumerates,
    // decomposes and classifies. An invented reading would be compared against
    // the engine's declared one and the gate would report a divergence between
    // the oracle and its own caller.
    const oracleRun = labelAll(observations, oracleContext(observations));
    context.sink.write(join(seedDir, ORACLE_LABELS), encodeJsonl(oracleRun.labels));

    // AL2's route, and the only one. This command never runs sealed -- M56 makes
    // `--sealed` a usage error here -- which is why §9 step 3 carries no such flag.
    const truth = decodeJsonl(
      { path: join(seedDir, GROUND_TRUTH), zone: "GENERATOR_TRUST" },
      { parse: readTruthRow },
    );
    const completeness = completenessGate(
      oracleRun.results,
      trueAllocations(truth, observations),
    );

    let consistency: ConsistencyReport | null = null;
    if (runsConsistencyGate(split)) {
      const pairs = drawPairs(observations, drawSeed);
      const result = consistencyGate(observations, pairs);
      consistency = Object.freeze({
        passed: result.passed,
        sample_size: result.sample_size,
        meets_declared_sample_size: result.meets_declared_sample_size,
        draw_seed: drawSeed,
        // §7's value, recorded whether or not it was the one used, so a reader
        // of the artifact can see a departure without holding the spec.
        frozen_draw_seed: CONSISTENCY_DRAW_SEED,
        authoritative,
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
          `${consistency.authoritative ? " (§7 frozen)" : " (OVERRIDE — NOT AUTHORITATIVE)"}` +
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
      describe:
        "EXPLORATORY override of §7's frozen §5.3 draw seed. Local use only; the gate " +
        "artifact is marked non-authoritative.",
    },
  },
  run,
};
