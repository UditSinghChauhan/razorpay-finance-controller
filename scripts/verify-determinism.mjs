/**
 * `pnpm run verify:determinism` — run the same period twice against a live API
 * and show that everything content-addressed comes back identical.
 *
 * Two `POST /runs` for the same dataset, then `GET /runs/:id/ledger/verify` for
 * each, then a diff of six fields across the pair:
 *
 * ```
 *   run_id                  the content-addressed run identifier
 *   ledger_root_hash        the stored root of the hash chain
 *   recomputed_root_hash    the root the verify route recomputed from genesis
 *   event_count             ledger events in the chain
 *   total_dr_paise          debits, recomputed from the log
 *   unresolved_value_paise  what the close gate could not resolve
 * ```
 *
 * Prints one row per field with both readings and `same` or `DIFFERENT`, then
 * the chain and trial-balance verdicts for each run. Exit 0 when every field
 * agrees and both chains verify; exit 1 on any divergence, on a chain that does
 * not recompute to its stored root, or on an API that cannot be reached.
 *
 * **This is observability, not evidence.** The default period, `demo-500`, is a
 * product fixture that `demo/README.md` places outside `bench/`, unscored, and
 * never benchmark evidence. Two agreeing hashes prove that the engine's output
 * is a function of its input and not of a clock, a map-iteration order or a
 * random seed — which is the property a reviewer can check on their own machine
 * in under a minute, and which the README's "Verify it in sixty seconds" section
 * leans on. They prove nothing about accuracy, coverage or any benchmark figure;
 * every one of those lives under `runs/seal-v1.0.13/` and is disclosed in the
 * README with its own limits, and this script reads none of it.
 *
 * **Why it is a script and not a test.** The property it checks — two
 * independent HTTP requests to a running process produce byte-identical
 * content-addressed identifiers — is a property of the deployed API, not of a
 * module. `apps/api/tests` already pins determinism at the module level; this
 * is the same fact shown through the front door, for someone who has just
 * started `pnpm run dev:api` and wants to see it before they trust it.
 *
 * **Timing is printed and is not a rate.** The wall clock beside each POST is
 * for this fixture on this machine and says nothing about throughput; the
 * benchmark's measured figures are in the README.
 *
 * **Plain `.mjs`, no dependency.** `scripts/` sits outside every package block
 * in `eslint.config.js`, so only the base config applies and it declares no
 * Node globals: `process` is imported rather than assumed, `fetch` is reached
 * through `globalThis`, and output goes through `process.stdout.write` rather
 * than `console.log`. This is the pattern `scripts/check-env.mjs` set.
 *
 * Environment:
 *   ASSAY_API_URL      base URL of the running API   (default http://127.0.0.1:8787)
 *   ASSAY_DATASET      demo period to run twice      (default demo-500)
 */

// Imported rather than taken as a global: see the docblock's note on
// `eslint.config.js`. The explicit specifier is also what the rest of the
// workspace does with `node:` builtins.
import process from "node:process";
import { performance } from "node:perf_hooks";

const BASE_URL = (process.env["ASSAY_API_URL"] ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
const DATASET = process.env["ASSAY_DATASET"] ?? "demo-500";

/** The fields compared across the two runs, in the order they are printed. */
const COMPARED = [
  "run_id",
  "ledger_root_hash",
  "recomputed_root_hash",
  "event_count",
  "total_dr_paise",
  "unresolved_value_paise",
];

const out = (line) => process.stdout.write(`${line}\n`);
const err = (line) => process.stderr.write(`${line}\n`);

/**
 * One `POST /runs` and the `GET /runs/:id/ledger/verify` that follows it,
 * flattened to the six compared fields plus the verdicts the verify route
 * reports. Throws on any non-2xx so the caller can report "unreachable" or
 * "refused" rather than diffing an error body against a run.
 */
async function runOnce(label) {
  const started = performance.now();
  const post = await globalThis.fetch(`${BASE_URL}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataset: DATASET }),
  });
  const elapsedMs = performance.now() - started;
  if (post.status !== 201) {
    throw new Error(`${label}: POST /runs answered ${String(post.status)}: ${await post.text()}`);
  }
  const summary = await post.json();

  const verify = await globalThis.fetch(`${BASE_URL}/runs/${summary.run_id}/ledger/verify`);
  if (verify.status !== 200) {
    throw new Error(
      `${label}: GET /runs/${summary.run_id}/ledger/verify answered ${String(verify.status)}: ${await verify.text()}`,
    );
  }
  const ledger = await verify.json();

  return {
    label,
    elapsedMs,
    fields: {
      run_id: summary.run_id,
      ledger_root_hash: summary.summary.ledger_root_hash,
      recomputed_root_hash: ledger.recomputed_root_hash,
      event_count: summary.summary.event_count,
      total_dr_paise: ledger.total_dr_paise,
      unresolved_value_paise: summary.summary.unresolved_value_paise,
    },
    verdicts: {
      chain_ok: ledger.chain_ok,
      root_matches: ledger.root_matches,
      trial_balance_ok: ledger.trial_balance_ok,
      total_dr_paise: ledger.total_dr_paise,
      total_cr_paise: ledger.total_cr_paise,
      period_status: summary.summary.period_status,
    },
  };
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

async function main() {
  out(`verify:determinism  api=${BASE_URL}  dataset=${DATASET}`);
  out("");

  let first;
  let second;
  try {
    first = await runOnce("run 1");
    second = await runOnce("run 2");
  } catch (cause) {
    err(`FAIL: ${cause instanceof Error ? cause.message : String(cause)}`);
    err(`Is the API running? Start it with: pnpm run dev:api`);
    return 1;
  }

  const widest = Math.max(...COMPARED.map((f) => f.length));
  let divergent = 0;
  for (const field of COMPARED) {
    const a = first.fields[field];
    const b = second.fields[field];
    const same = a === b;
    if (!same) divergent += 1;
    out(`${pad(field, widest)}  ${same ? "same     " : "DIFFERENT"}  ${String(a)}`);
    if (!same) out(`${pad("", widest)}             ${String(b)}`);
  }

  out("");
  for (const run of [first, second]) {
    const v = run.verdicts;
    out(
      `${run.label}: chain recomputes genesis→root ${v.chain_ok && v.root_matches ? "yes" : "NO"}, ` +
        `trial balance ${v.trial_balance_ok ? "ok" : "FAILS"} ` +
        `(${String(v.total_dr_paise)} dr = ${String(v.total_cr_paise)} cr), ` +
        `period ${String(v.period_status)}, ` +
        `${(run.elapsedMs / 1000).toFixed(2)}s wall clock on this machine — not a throughput rate`,
    );
  }

  const chainsVerify = [first, second].every(
    (r) => r.verdicts.chain_ok && r.verdicts.root_matches && r.verdicts.trial_balance_ok,
  );

  out("");
  if (divergent === 0 && chainsVerify) {
    out(
      `PASS: ${String(COMPARED.length)} fields identical across two independent runs; both chains verify. ` +
        `The run id and root hash are functions of the input, not of a clock.`,
    );
    out(`Note: ${DATASET} is a product fixture, not benchmark evidence (see demo/README.md).`);
    return 0;
  }
  if (divergent > 0) {
    err(`FAIL: ${String(divergent)} of ${String(COMPARED.length)} fields differ between two runs of the same input.`);
  }
  if (!chainsVerify) {
    err(`FAIL: at least one chain did not recompute to its stored root or did not balance.`);
  }
  return 1;
}

process.exitCode = await main();
