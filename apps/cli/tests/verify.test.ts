import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendEvent, computeGenesisHash, createChain } from "@assay/ledger";
import { afterAll, describe, expect, it } from "vitest";

import { EXIT, dispatch, encodeJsonl, loadLedgerEvents, memorySink } from "../src/index.js";
import { GENESIS_INPUTS, RUN_ID, draft, recorder } from "./fixtures.js";

/**
 * `assay verify` end to end — `ARCHITECTURE.md §9`'s
 * `GET /runs/:id/ledger/verify` at the command line.
 *
 * > *"`/ledger/verify` exists so a reviewer can check tamper-evidence **live**
 * > rather than be told about it."*
 *
 * The chain is built with `packages/ledger`'s own API, written out, and read
 * back through `sealStoredEvent` — the entry point that package documents for an
 * event *"read back from storage, a file, or an API response"*. Nothing about a
 * hash is computed in this package or in this suite.
 */

const roots: string[] = [];
function runDir(events: number, tamper: "none" | "body" | "root" = "none"): string {
  const dir = mkdtempSync(join(tmpdir(), "assay-cli-run-"));
  roots.push(dir);

  let chain = createChain(computeGenesisHash(GENESIS_INPUTS), RUN_ID);
  for (let n = 1; n <= events; n += 1) chain = appendEvent(chain, draft(n));

  const stored = chain.events.map((event) =>
    tamper === "body" && event.seq === 0
      ? { ...event, subject_ids: ["obs_tampered"] }
      : event,
  );

  writeFileSync(join(dir, "ledger_events.jsonl"), encodeJsonl(stored), "utf8");
  writeFileSync(
    join(dir, "ledger_root_hash.txt"),
    tamper === "root" ? `${"0".repeat(64)}\n` : `${chain.root_hash}\n`,
    "utf8",
  );
  writeFileSync(
    join(dir, "manifest.json"),
    `${JSON.stringify({
      // ARCHITECTURE.md §8: "A run is fully described by (dataset_hash,
      // engine_commit, config_hash, llm_provider, llm_cache_hash)."
      dataset_hash: GENESIS_INPUTS.dataset_hash,
      engine_commit: GENESIS_INPUTS.engine_commit,
      config_hash: GENESIS_INPUTS.config_hash,
      llm_provider: "offline",
      llm_cache_hash: null,
    })}\n`,
    "utf8",
  );
  return dir;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function verify(dir: string): Promise<{ code: number; out: string[]; err: string[] }> {
  const out = recorder();
  const err = recorder();
  const code = await dispatch({
    argv: ["verify", "--run", dir, "--events", join(dir, "ledger_events.jsonl")],
    env: {},
    out: out.write,
    err: err.write,
    sink: memorySink(),
  });
  return { code, out: out.lines, err: err.lines };
}

describe("a well-formed run", () => {
  it("passes G4 and G2, and says which gate it did not check", () => {
    const dir = runDir(3);
    return verify(dir).then((result) => {
      expect(result.code).toBe(EXIT.OK);
      expect(result.out.join("\n")).toContain("G4 hash chain       PASS");
      expect(result.out.join("\n")).toContain("G2 trial balance    PASS");
      // RECONCILIATION_SPEC.md §10.1's G3 reads Decision and Exception records
      // against journal lines. packages/ledger's close-gate.ts is "deliberately
      // absent rather than stubbed", so the command reports the gap instead of
      // computing a second reading of §10.1's item partition.
      expect(result.out.join("\n")).toContain("G3 Suspense identity  NOT CHECKED");
    });
  });

  it("reads the events back through packages/ledger's own validator", () => {
    const dir = runDir(2);
    const events = loadLedgerEvents(join(dir, "ledger_events.jsonl"));
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.seq)).toEqual([0, 1]);
  });
});

describe("tamper evidence", () => {
  it("G4 fails when an event body was altered", () => {
    const dir = runDir(3, "body");
    return verify(dir).then((result) => {
      expect(result.code).toBe(EXIT.FAILURE);
      expect(result.out.join("\n")).toContain("G4 hash chain       FAIL");
      expect(result.err.join("\n")).toContain("the audit trail was altered");
    });
  });

  it("G4 fails when the stored root hash does not match the recomputation", () => {
    // §10.1's G4 is "recomputes from genesis AND MATCHES THE STORED ROOT HASH".
    // Two independently written records, or the check tests nothing.
    const dir = runDir(3, "root");
    return verify(dir).then((result) => {
      expect(result.code).toBe(EXIT.FAILURE);
      expect(result.out.join("\n")).toContain("G4 hash chain       FAIL");
    });
  });
});

describe("the SQLite route is reported, not substituted", () => {
  it("without --events, verify names ARCHITECTURE.md §8 as the blocker", async () => {
    const dir = runDir(1);
    const out = recorder();
    const err = recorder();
    const code = await dispatch({
      argv: ["verify", "--run", dir],
      env: {},
      out: out.write,
      err: err.write,
      sink: memorySink(),
    });
    expect(code).toBe(EXIT.UNAVAILABLE);
    expect(err.lines.join("\n")).toContain("better-sqlite3");
    expect(err.lines.join("\n")).toContain("ARCHITECTURE.md §8");
  });
});
