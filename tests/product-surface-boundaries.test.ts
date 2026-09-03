import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEMO_DATASET_IDS, observationsPathFor } from "../apps/api/src/index.js";

/**
 * The product surface reaches no benchmark artifact, and invents no figure.
 *
 * This lives at the workspace level rather than under `apps/web/tests/` for the
 * reason `workspace-suite-floor.test.ts` does: it is a check about a boundary
 * BETWEEN parts of the workspace, and it reads the source tree of one app while
 * importing the allowlist of another. Neither belongs inside a package's own
 * suite.
 *
 * Two boundaries are checked, and they are different:
 *
 * 1. **No benchmark path is reachable.** `demo/README.md` states five hard
 *    boundaries on the demo fixture and the fifth is that nothing there may
 *    support a benchmark claim; `EVALUATION_SPEC.md §5.5` admits only numbers
 *    that exist in a committed run artifact. The frontend therefore reads no
 *    file at all — it speaks to `apps/api` over `/api`, and `apps/api` resolves
 *    a dataset NAME against a table with no benchmark entry in it.
 * 2. **No figure is fabricated.** Every rupee amount, identifier and count the
 *    UI shows arrives in a response. A demo value hard-coded into a component
 *    would render identically to a real one, so the source is checked for the
 *    run's own values directly.
 *
 * The tree is walked rather than listed, so a component added later is covered
 * without anyone remembering to add it here.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const WEB_SRC = join(ROOT, "apps", "web", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

const FILES = sourceFiles(WEB_SRC);

/** Source with block and line comments removed, so prose cannot trip a check. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const name = (path: string): string => relative(WEB_SRC, path);

describe("apps/web has source to check", () => {
  it("finds component files", () => {
    // Guards the degenerate case: `it.each` over an empty list asserts nothing.
    expect(FILES.length).toBeGreaterThan(0);
  });
});

describe("no benchmark path is reachable from apps/web", () => {
  it.each(FILES)("%s names no benchmark or run artifact", (path) => {
    const body = code(path);
    for (const forbidden of [
      "bench/",
      "runs/seal-",
      "seal-v1.0.13",
      "metrics.json",
      "ground_truth",
      "oracle_labels",
      ".jsonl",
    ]) {
      expect(body, `${name(path)} contains ${forbidden}`).not.toContain(forbidden);
    }
  });

  it.each(FILES)("%s reads no file of its own", (path) => {
    const body = code(path);
    for (const forbidden of ["node:fs", "node:path", "readFileSync", "createReadStream"]) {
      expect(body, name(path)).not.toContain(forbidden);
    }
  });

  it("addresses only the /api namespace", () => {
    const targets = FILES.flatMap((path) => [
      ...code(path).matchAll(/fetch\(\s*[`"']([^`"']*)/g),
    ]).map((match) => match[1] ?? "");
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(target).toMatch(/^\/api\/runs/);
  });

  it("cannot name a benchmark dataset, because every allowlist entry is a demo fixture", () => {
    // The structural guarantee behind the checks above: apps/api resolves a
    // NAME, never a path. The table grew from one entry to four when the
    // controller scenarios were added, so this asserts the PROPERTY that
    // mattered rather than the length that happened to hold — every id the API
    // will run resolves under `demo/`, and none of them under `bench/`.
    expect(DEMO_DATASET_IDS.length).toBeGreaterThan(0);
    for (const id of DEMO_DATASET_IDS) {
      const path = observationsPathFor(id);
      expect(path, id).toContain(join(ROOT, "demo", id));
      expect(path, id).not.toContain(join(ROOT, "bench"));
    }
  });

  /**
   * The picker offers exactly what the server will run.
   *
   * `apps/web/src/lib/scenarios.ts` holds a label and a sentence per period,
   * which the API has no business carrying; the API holds the allowlist, which
   * the web has no business deciding. The two are separate on purpose, and this
   * is the check that keeps them from drifting into two different answers to
   * *"which periods exist"* — a web-only id would reach a `400`, and an
   * API-only id would be unreachable from the product surface.
   */
  it("offers exactly the periods the allowlist admits", async () => {
    const { DEMO_SCENARIOS, DEFAULT_SCENARIO_ID } = await import(
      "../apps/web/src/lib/scenarios.js"
    );
    expect(DEMO_SCENARIOS.map((s) => s.id).sort()).toEqual([...DEMO_DATASET_IDS].sort());
    expect([...DEMO_DATASET_IDS]).toContain(DEFAULT_SCENARIO_ID);
  });

  /**
   * No scenario caption predicts what the controller will do with the period.
   *
   * The panel renders `@assay/controller`'s actual trace. A description that
   * announced the outcome would be a second, unchecked answer beside the real
   * one, and on a fixture edit the two would disagree silently — which is the
   * failure this whole task was written to avoid.
   */
  it("describes what each period contains, never what the controller will do", async () => {
    const { DEMO_SCENARIOS } = await import("../apps/web/src/lib/scenarios.js");
    for (const scenario of DEMO_SCENARIOS) {
      const text = `${scenario.label} ${scenario.description}`.toUpperCase();
      for (const outcome of [
        "ESCALAT", "BUDGET_EXHAUSTED", "NO_ELIGIBLE_ITEM", "NO_PROGRESS",
        "P1_ALREADY_CLOSED", "P2_NO_CLOSING_SET", "P3_ESCALATE", "COVERS_RESIDUAL",
        "CLOSING SET", "THE CONTROLLER WILL",
      ]) {
        expect(text, `${scenario.id} predicts ${outcome}`).not.toContain(outcome);
      }
    }
  });
});

/**
 * No runtime file pairs a demo period with a controller outcome.
 *
 * The scenarios exist so the controller's behaviour can be **observed**. That is
 * worth nothing if the product surface already knows the answer: a component or
 * a route that said *"demo-backlog exhausts the budget"* would render the same
 * words whether or not the loop did, and a fixture edit would leave the claim
 * standing and wrong.
 *
 * The check is deliberately narrow, because both halves of the vocabulary have
 * honest homes. `packages/controller` DEFINES the stop reasons and rules;
 * `ControllerPanel.tsx` LABELS every one of them for display, from the trace it
 * was handed. `datasets.ts` and `scenarios.ts` name the periods. What no file
 * may do is carry both — a dataset id and a controller outcome — because that
 * is the shape a hard-coded expectation takes.
 */
describe("no scenario outcome is hard-coded into the runtime", () => {
  const API_SRC = join(ROOT, "apps", "api", "src");
  const RUNTIME = [...FILES, ...sourceFiles(API_SRC)];

  /** `state.ts`'s `StopReason` and the rules that decide one. */
  const OUTCOMES = [
    "ESCALATED", "BUDGET_EXHAUSTED", "NO_ELIGIBLE_ITEM", "NO_PROGRESS",
    "P0_INTEGRITY", "P1_ALREADY_CLOSED", "P2_NO_CLOSING_SET", "P3_ESCALATE",
    "SEQ_BUDGET", "covers_residual", "already_under_threshold",
    "CHAIN_BROKEN", "TRIAL_BALANCE_FAILED",
  ];

  it("has runtime source to check", () => {
    expect(RUNTIME.length).toBeGreaterThan(FILES.length);
  });

  it.each(RUNTIME)("%s names no period and an outcome together", async (path) => {
    const { DEMO_SCENARIOS } = await import("../apps/web/src/lib/scenarios.js");
    const body = code(path);
    const periods = DEMO_SCENARIOS.map((s) => s.id).filter((id) => body.includes(id));
    if (periods.length === 0) return;
    for (const outcome of OUTCOMES) {
      expect(
        body,
        `${relative(ROOT, path)} names ${periods.join(", ")} and ${outcome}`,
      ).not.toContain(outcome);
    }
  });
});

describe("no demo value is hard-coded into apps/web", () => {
  it.each(FILES)("%s carries none of the run's own identifiers", (path) => {
    const body = code(path);
    for (const forbidden of [
      "obs_reconline",
      "obs_settlement",
      "setl_AMBIG",
      "pay_AMB",
      "cand_",
      "comp_58b9",
      "engine.s5_validate",
    ]) {
      expect(body, name(path)).not.toContain(forbidden);
    }
  });

  it.each(FILES)("%s carries none of the certificate's member amounts", (path) => {
    const body = code(path);
    // The five allocation terms and the target they tie out to, in paise.
    for (const amount of ["5000000", "3000000", "2000000", "6000000", "4000000", "10000000"]) {
      expect(body, name(path)).not.toContain(amount);
    }
  });
});
