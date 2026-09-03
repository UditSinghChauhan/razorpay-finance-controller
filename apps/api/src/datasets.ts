import { resolve } from "node:path";

/**
 * The datasets this API may run — a **closed allowlist**, not a path parameter.
 *
 * `ARCHITECTURE.md §3` gives `apps/cli` *"all filesystem I/O"*, and this package
 * performs none: it names a dataset, and `@assay/cli`'s `loadObservations`
 * performs the read through the `AGENT` zone guard that
 * `PREREGISTRATION.md §6.2`'s `AL2`/`AL8` rest on. What this module contributes
 * is that the **name cannot be a path**. A `POST /runs` carrying
 * `bench/test/9000/observations.jsonl`, or `../../etc/passwd`, resolves to
 * nothing here and is refused before any door is reached.
 *
 * That matters beyond the usual traversal argument. The sealed benchmark corpus
 * sits in this same working tree, and an API that accepted a path would be one
 * request away from serving `bench/` through a product surface — where a figure
 * read off it would be a benchmark number that never passed
 * `EVALUATION_SPEC.md §5.5`. The allowlist makes that unreachable rather than
 * discouraged.
 *
 * **Every entry is a `demo/` fixture, and that is the rule the table enforces.**
 * `PROJECT_SPEC.md §10` specifies the demo against `--dataset demo-500`;
 * `demo/README.md` records that these fixtures are product artifacts, outside
 * `bench/`, never scored and never benchmark evidence. Adding a benchmark seed
 * to this table would contradict that record, so the table has no room for one:
 * every path below is under `demo/`, and `tests/datasets.test.ts` asserts it of
 * the table rather than of any one row.
 *
 * **The three scenarios beside `demo-500` exist for `@assay/controller`.**
 * `demo-500` holds exactly one queue row that opens a Suspense item, so the
 * close controller's plan can only ever have one member and its policy is
 * unobservable — every branch but `P3_ESCALATE` is unreachable on it. The three
 * below are periods the same frozen engine resolves differently, so the
 * controller's own choices become something a reviewer can watch it make rather
 * than something a test asserts. They add no capability: the engine, the ledger,
 * the close gate and the certificate are untouched, and the only thing that
 * differs between the four runs is the evidence.
 */

/** The repository root, from this module's own location. */
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

export const DEMO_DATASET_IDS = Object.freeze([
  "demo-500",
  "demo-close",
  "demo-multi",
  "demo-backlog",
] as const);

export type DemoDatasetId = (typeof DEMO_DATASET_IDS)[number];

/** Where each allowlisted dataset's `observations.jsonl` lives, relative to the root. */
const RELATIVE_PATHS: Readonly<Record<DemoDatasetId, string>> = Object.freeze({
  "demo-500": "demo/demo-500/observations.jsonl",
  "demo-close": "demo/demo-close/observations.jsonl",
  "demo-multi": "demo/demo-multi/observations.jsonl",
  "demo-backlog": "demo/demo-backlog/observations.jsonl",
});

export function isDemoDatasetId(value: string): value is DemoDatasetId {
  return (DEMO_DATASET_IDS as readonly string[]).includes(value);
}

/**
 * The observations path for an allowlisted dataset.
 *
 * `root` is a parameter so a test can point the allowlist at a fixture tree
 * without this module reading an environment variable. It defaults to the
 * repository root and is not otherwise configurable: a runtime-settable root
 * would reopen the arbitrary-path route the allowlist exists to close.
 */
export function observationsPathFor(id: DemoDatasetId, root: string = REPO_ROOT): string {
  return resolve(root, RELATIVE_PATHS[id]);
}
