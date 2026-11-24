/**
 * `node scripts/seal-bench-v2.mjs` — the bench-v2 seal, behind five refusal
 * gates (`docs/BENCH_V2_PREREGISTRATION.md §7`).
 *
 * **Written at bench-v2 increment 3 and NOT run.** No bench-v2 corpus exists
 * when this file is committed; the scoring command that produces the report it
 * reads is the seal order's work (`§8`). Every gate is evaluated, every failure
 * is printed with the gate that raised it, and the process exits non-zero on
 * any failure. Nothing is written unless all five gates pass, and nothing is
 * ever overwritten.
 *
 * ```
 *   G-A  count(documented_truly_ambiguous) > 0 overall and on every (block, seed)
 *   G-B  count(documented_discriminable)   > 0 overall and on every block-P seed
 *   G-C  every headline denominator is non-empty, or declared empty in §5
 *        (M-B on block S); M-D's committed set may be empty only if
 *        EXCEPTED_NO_ALLOCATION accounts for every documented-TA target; M-D's
 *        value must have been computed against a reference arm
 *   G-D  docs/BENCH_V2_PREREGISTRATION.md is byte-identical to its content at
 *        the pre-registration commit; that commit is an ancestor of HEAD, is on
 *        a remote-tracking branch (so its timestamp is public), and no later
 *        commit touches the file. The SHA is recorded in the seal output
 *   G-E  nothing under runs/seal-v1.0.13/**, bench/test/** or bench/dev/** differs
 *        from the pre-registration commit, in HEAD or in the working tree
 * ```
 *
 * **The pre-registration commit** is the commit that ADDED the document
 * (`git log --diff-filter=A`), unless `--prereg-commit <sha>` names a later one;
 * an override is honoured only if it touches the document, and every earlier
 * version is listed in the output as `prior_versions` so a revision is visible
 * rather than silent.
 *
 * **The report** (`--report <path>`) is the scored output of the seal order's
 * scoring command. Its contract, fixed here so the two are written against one
 * shape:
 *
 * ```
 *   {
 *     "benchmark": "bench-v2",
 *     "units":    [ { "block": "P"|"S", "seed": n, "family": "A01", "documented_counts": { "TRULY_AMBIGUOUS": n, "DISCRIMINABLE": n, ... } } ],
 *     "headline": [ { "block": "P"|"S", "agent": "ASSAY"|"A2-NOABSTAIN"|..., "population": "OVERALL",
 *                     "metrics": [ BenchV2Metric ... ], "forced_choice_harm": ForcedChoiceHarm } ]
 *   }
 * ```
 *
 * `BenchV2Metric` and `ForcedChoiceHarm` are `packages/eval/src/metrics/bench-v2.ts`'s.
 *
 * **Plain `.mjs`, no dependency** — `scripts/`'s convention (see
 * `scripts/verify-determinism.mjs`): `process` is imported, output goes through
 * `process.stdout.write`.
 *
 * Usage:
 *   node scripts/seal-bench-v2.mjs --report <path> [--prereg-commit <sha>] [--check]
 *
 *   --check   evaluate every gate and print the verdict; write nothing.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const PREREG_PATH = "docs/BENCH_V2_PREREGISTRATION.md";
const PROTECTED_PATHS = ["runs/seal-v1.0.13", "bench/test", "bench/dev"];
const SEAL_DIR = "runs/bench-v2-seal";
const SEAL_FILE = `${SEAL_DIR}/seal.json`;

/** `§5`: the headline metrics and the arm each is scored on. */
const HEADLINE = Object.freeze([
  { id: "M-A", agent: "ASSAY" },
  { id: "M-B", agent: "ASSAY" },
  { id: "M-C", agent: "ASSAY" },
  { id: "M-D", agent: "A2-NOABSTAIN" },
  { id: "M-E", agent: "ASSAY" },
  { id: "M-F", agent: "ASSAY" },
  { id: "M-G", agent: "ASSAY" },
]);

/** `§5`: denominators declared empty before any figure exists, as `metric@block`. */
const DECLARED_EMPTY = new Set(["M-B@S"]);

const BLOCKS = Object.freeze(["P", "S"]);

// ---------------------------------------------------------------------------

const out = (line = "") => process.stdout.write(`${line}\n`);

function parseArgs(argv) {
  const args = { report: null, preregCommit: null, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--report") args.report = argv[++i] ?? null;
    else if (a === "--prereg-commit") args.preregCommit = argv[++i] ?? null;
    else throw new Error(`unknown argument ${String(a)}`);
  }
  return args;
}

function git(args, { buffer = false, allowFail = false } = {}) {
  try {
    return execFileSync("git", args, { encoding: buffer ? "buffer" : "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A refusal: the gate that raised it and why. */
class Refusals {
  constructor() {
    this.items = [];
  }
  add(gate, reason) {
    this.items.push({ gate, reason });
  }
  get count() {
    return this.items.length;
  }
}

// --- G-D ------------------------------------------------------------------

function gateD(refusals, override) {
  const record = { path: PREREG_PATH };
  const added = (git(["log", "--diff-filter=A", "--format=%H", "--", PREREG_PATH], { allowFail: true }) ?? "")
    .trim()
    .split("\n")
    .filter(Boolean);
  const addingCommit = added.at(-1) ?? null;
  const history = (git(["log", "--format=%H %cI %s", "--", PREREG_PATH], { allowFail: true }) ?? "")
    .trim()
    .split("\n")
    .filter(Boolean);
  record.history = history;
  if (addingCommit === null) {
    refusals.add("G-D", `${PREREG_PATH} has never been committed; there is no pre-registration commit.`);
    return record;
  }
  let commit = addingCommit;
  if (override !== null) {
    const resolved = git(["rev-parse", "--verify", `${override}^{commit}`], { allowFail: true });
    if (resolved === null) {
      refusals.add("G-D", `--prereg-commit ${override} does not name a commit.`);
      return record;
    }
    commit = resolved.trim();
    const touches = git(["diff-tree", "--no-commit-id", "--name-only", "-r", "--root", commit, "--", PREREG_PATH]) ?? "";
    if (!touches.split("\n").includes(PREREG_PATH)) {
      refusals.add("G-D", `--prereg-commit ${commit} does not touch ${PREREG_PATH}.`);
      return record;
    }
  }
  record.prereg_commit = commit;
  record.adding_commit = addingCommit;
  record.prior_versions = history.filter((line) => !line.startsWith(commit)).filter((line) => {
    const sha = line.split(" ")[0] ?? "";
    return git(["merge-base", "--is-ancestor", sha, commit], { allowFail: true }) !== null;
  });
  record.commit_date = (git(["show", "-s", "--format=%cI", commit]) ?? "").trim();

  if (git(["merge-base", "--is-ancestor", commit, "HEAD"], { allowFail: true }) === null) {
    refusals.add("G-D", `pre-registration commit ${commit} is not an ancestor of HEAD.`);
  }
  const remote = (git(["branch", "-r", "--contains", commit], { allowFail: true }) ?? "").trim();
  if (remote === "") {
    refusals.add("G-D", `pre-registration commit ${commit} is on no remote-tracking branch: its timestamp is not public. Push it first.`);
  }
  record.on_remote = remote.split("\n").map((s) => s.trim()).filter(Boolean);
  const later = (git(["log", "--format=%H", `${commit}..HEAD`, "--", PREREG_PATH], { allowFail: true }) ?? "").trim();
  if (later !== "") {
    refusals.add("G-D", `${PREREG_PATH} was changed after the pre-registration commit by: ${later.split("\n").join(", ")}.`);
  }
  const committed = git(["show", `${commit}:${PREREG_PATH}`], { buffer: true, allowFail: true });
  if (committed === null) {
    refusals.add("G-D", `${PREREG_PATH} does not exist at ${commit}.`);
    return record;
  }
  record.sha256_at_commit = sha256(committed);
  if (!existsSync(PREREG_PATH)) {
    refusals.add("G-D", `${PREREG_PATH} is missing from the working tree.`);
    return record;
  }
  const current = readFileSync(PREREG_PATH);
  record.sha256_working_tree = sha256(current);
  if (!current.equals(committed)) {
    refusals.add("G-D", `${PREREG_PATH} is not byte-identical to its content at ${commit} (sha256 ${record.sha256_working_tree} vs ${record.sha256_at_commit}).`);
  }
  return record;
}

// --- G-E ------------------------------------------------------------------

function gateE(refusals, preregCommit) {
  const record = { paths: PROTECTED_PATHS };
  const dirty = (git(["status", "--porcelain", "--untracked-files=all", "--", ...PROTECTED_PATHS]) ?? "").trim();
  if (dirty !== "") {
    refusals.add("G-E", `uncommitted or untracked changes under protected paths:\n${dirty}`);
  }
  if (preregCommit === undefined) {
    refusals.add("G-E", "no pre-registration commit to compare protected paths against (see G-D).");
    return record;
  }
  record.compared_against = preregCommit;
  const changed = (git(["diff", "--name-only", preregCommit, "HEAD", "--", ...PROTECTED_PATHS], { allowFail: true }) ?? "").trim();
  if (changed !== "") {
    refusals.add("G-E", `committed changes under protected paths since ${preregCommit}:\n${changed}`);
  }
  return record;
}

// --- G-A, G-B, G-C ----------------------------------------------------------

function readReport(refusals, path) {
  if (path === null) {
    refusals.add("INPUT", "--report <path> is required: the scored bench-v2 report (see this file's docblock for its shape).");
    return null;
  }
  if (!existsSync(path)) {
    refusals.add("INPUT", `report ${path} does not exist.`);
    return null;
  }
  try {
    const bytes = readFileSync(path);
    const report = JSON.parse(bytes.toString("utf8"));
    if (report.benchmark !== "bench-v2" || !Array.isArray(report.units) || !Array.isArray(report.headline)) {
      refusals.add("INPUT", `report ${path} is not a bench-v2 report (benchmark, units[], headline[] required).`);
      return null;
    }
    return { report, sha256: sha256(bytes) };
  } catch (error) {
    refusals.add("INPUT", `report ${path} is not valid JSON: ${String(error)}`);
    return null;
  }
}

const countOf = (unit, cls) => Number(unit.documented_counts?.[cls] ?? 0);

function groupBy(units, keyOf) {
  const groups = new Map();
  for (const u of units) {
    const k = keyOf(u);
    groups.set(k, [...(groups.get(k) ?? []), u]);
  }
  return groups;
}

function gateA(refusals, report) {
  const total = report.units.reduce((t, u) => t + countOf(u, "TRULY_AMBIGUOUS"), 0);
  if (total <= 0) refusals.add("G-A", "count(documented_truly_ambiguous) is 0 over the whole corpus.");
  for (const [key, units] of groupBy(report.units, (u) => `${u.block}:${u.seed}`)) {
    const n = units.reduce((t, u) => t + countOf(u, "TRULY_AMBIGUOUS"), 0);
    if (n <= 0) refusals.add("G-A", `count(documented_truly_ambiguous) is 0 on (block, seed) ${key}.`);
  }
  return { documented_truly_ambiguous: total };
}

function gateB(refusals, report) {
  const total = report.units.reduce((t, u) => t + countOf(u, "DISCRIMINABLE"), 0);
  if (total <= 0) refusals.add("G-B", "count(documented_discriminable) is 0 over the whole corpus.");
  for (const [key, units] of groupBy(report.units.filter((u) => u.block === "P"), (u) => `${u.block}:${u.seed}`)) {
    const n = units.reduce((t, u) => t + countOf(u, "DISCRIMINABLE"), 0);
    if (n <= 0) refusals.add("G-B", `count(documented_discriminable) is 0 on block-P seed ${key} (A04 absent or misbuilt).`);
  }
  if (!report.units.some((u) => u.block === "P")) refusals.add("G-B", "the report carries no block-P unit.");
  return { documented_discriminable: total };
}

function gateC(refusals, report) {
  const checked = [];
  for (const block of BLOCKS) {
    const taInBlock = report.units.filter((u) => u.block === block).reduce((t, u) => t + countOf(u, "TRULY_AMBIGUOUS"), 0);
    for (const { id, agent } of HEADLINE) {
      const row = report.headline.find((h) => h.block === block && h.agent === agent && (h.population ?? "OVERALL") === "OVERALL");
      const m = row?.metrics?.find((x) => x.id === id);
      if (m === undefined) {
        refusals.add("G-C", `${id} for ${agent} on block ${block} is missing from the report.`);
        continue;
      }
      const declared = DECLARED_EMPTY.has(`${id}@${block}`);
      let ok = m.denominator > 0 || declared;
      if (!ok && id === "M-D") {
        ok = Number(m.excluded_by?.EXCEPTED_NO_ALLOCATION ?? 0) === taInBlock && taInBlock > 0;
      }
      if (!ok) refusals.add("G-C", `${id} (${String(m.name)}) for ${agent} on block ${block} has an empty denominator that §5 does not declare empty.`);
      if (declared && m.denominator > 0) {
        refusals.add("G-C", `${id} on block ${block} was declared empty in §5 but has denominator ${String(m.denominator)}: the corpus is not the one pre-registered.`);
      }
      checked.push({ block, agent, id, numerator: m.numerator, denominator: m.denominator, excluded_by: m.excluded_by ?? {}, value: m.value });
      if (id === "M-D") {
        const harm = row.forced_choice_harm;
        if (harm === undefined || harm === null || harm.value_paise === null || harm.value_paise === undefined) {
          refusals.add("G-C", `M-D's value on block ${block} was not computed against a reference arm (NO_REFERENCE_ARM).`);
        } else {
          checked.push({ block, agent, id: "M-D value", value_paise: harm.value_paise, held_targets: harm.held_targets, held_committed: harm.held_committed, excluded_by: harm.excluded_by ?? {} });
        }
      }
    }
  }
  return checked;
}

// ---------------------------------------------------------------------------

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    out(`REFUSED [INPUT] ${String(error.message ?? error)}`);
    out("usage: node scripts/seal-bench-v2.mjs --report <path> [--prereg-commit <sha>] [--check]");
    return 2;
  }
  const refusals = new Refusals();
  const prereg = gateD(refusals, args.preregCommit);
  const protectedPaths = gateE(refusals, prereg.prereg_commit);
  const loaded = readReport(refusals, args.report);
  const populations = loaded === null ? null : { ...gateA(refusals, loaded.report), ...gateB(refusals, loaded.report) };
  const headline = loaded === null ? null : gateC(refusals, loaded.report);

  out("bench-v2 seal");
  out(`  pre-registration commit  ${prereg.prereg_commit ?? "(none)"}  ${prereg.commit_date ?? ""}`);
  out(`  pre-registration sha256  ${prereg.sha256_at_commit ?? "(none)"}`);
  if ((prereg.prior_versions ?? []).length > 0) out(`  prior versions           ${prereg.prior_versions.join(" | ")}`);
  if (loaded !== null) out(`  report sha256            ${loaded.sha256}`);
  if (populations !== null) out(`  populations              TA ${String(populations.documented_truly_ambiguous)}  D ${String(populations.documented_discriminable)}`);

  if (refusals.count > 0) {
    for (const { gate, reason } of refusals.items) out(`REFUSED [${gate}] ${reason}`);
    out(`${String(refusals.count)} refusal(s). Nothing written. A refused seed is burned under AL7, never re-run to pass (§7).`);
    return 1;
  }
  if (args.check) {
    out("ALL GATES PASS (--check: nothing written).");
    return 0;
  }
  if (existsSync(SEAL_FILE)) {
    out(`REFUSED [OUTPUT] ${SEAL_FILE} already exists; a seal is never overwritten.`);
    return 1;
  }
  const head = (git(["rev-parse", "HEAD"]) ?? "").trim();
  const seal = {
    benchmark: "bench-v2",
    sealed_at_head: head,
    prereg,
    protected_paths: protectedPaths,
    report: { path: args.report, sha256: loaded.sha256 },
    populations,
    headline,
    gates: ["G-A", "G-B", "G-C", "G-D", "G-E"].map((gate) => ({ gate, passed: true })),
  };
  mkdirSync(SEAL_DIR, { recursive: true });
  writeFileSync(SEAL_FILE, `${JSON.stringify(seal, null, 2)}\n`, { flag: "wx" });
  out(`SEALED: ${SEAL_FILE} written. Commit it and tag it as the seal order directs; this script neither commits nor tags.`);
  return 0;
}

process.exitCode = main();
