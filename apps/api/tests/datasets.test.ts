import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { loadObservations } from "@assay/cli";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/index.js";
import { DEMO_DATASET_IDS, isDemoDatasetId, observationsPathFor } from "../src/datasets.js";

/**
 * The dataset allowlist — `apps/api/src/datasets.ts`.
 *
 * **What is under test is the guard, not the fixtures.** `POST /runs` takes a
 * NAME and never a path; this asserts that every name the table admits resolves
 * under `demo/`, that every one of them actually loads through `@assay/cli`'s
 * zone-guarded reader, and that nothing outside the table resolves at all —
 * including the shapes an attacker would reach for first, a traversal and a
 * `bench/` path.
 *
 * The fixtures themselves are product artifacts. `demo/README.md` states the
 * five boundaries: outside `bench/`, no seed, no ground truth, never scored,
 * never benchmark evidence. Nothing asserted here is a rate, an accuracy or a
 * comparison; the strongest claim below is that a file parses.
 */

const ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("the allowlist admits demo fixtures and nothing else", () => {
  it("holds at least the four controller periods", () => {
    expect([...DEMO_DATASET_IDS].sort()).toEqual([
      "demo-500",
      "demo-backlog",
      "demo-close",
      "demo-multi",
    ]);
  });

  it.each([...DEMO_DATASET_IDS])("%s resolves to an absolute path under demo/", (id) => {
    const path = observationsPathFor(id);
    expect(isAbsolute(path)).toBe(true);
    expect(path).toBe(join(ROOT, "demo", id, "observations.jsonl"));
    expect(path.startsWith(join(ROOT, "bench"))).toBe(false);
  });

  it.each([...DEMO_DATASET_IDS])("%s exists and parses as an Observation set", (id) => {
    const path = observationsPathFor(id);
    expect(existsSync(path), path).toBe(true);
    // The real guarded reader: `ObservationSchema.parse` over every line,
    // through the `AGENT` zone guard. A malformed fixture fails here.
    const observations = loadObservations(path);
    expect(observations.length).toBeGreaterThan(0);
    expect(new Set(observations.map((o) => o.obs_id)).size).toBe(observations.length);
  });

  it.each([
    "bench/test/9000/observations.jsonl",
    "../../etc/passwd",
    "demo/demo-500/observations.jsonl",
    "demo-501",
    "",
  ])("refuses %j", (candidate) => {
    expect(isDemoDatasetId(candidate)).toBe(false);
  });
});

describe("POST /runs over an unknown dataset", () => {
  it("is a 400 that names what is supported, and starts nothing", async () => {
    const response = await createApp().request("/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset: "bench/test/9000" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; supported: readonly string[] };
    expect(body.error).toBe("unknown_dataset");
    expect([...body.supported].sort()).toEqual([...DEMO_DATASET_IDS].sort());
  });
});
