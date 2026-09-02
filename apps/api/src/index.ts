/**
 * `@assay/api` — ASSAY's internal HTTP surface.
 *
 * `ARCHITECTURE.md §3` gives this package *"thin HTTP over engine + ledger"* and
 * `§9` scopes it to *"internal HTTP ... consumed only by `apps/web`. Local bind
 * only."* It holds **no reconciliation logic**: every figure it serves is read
 * off the {@link https://github.com/UditSinghChauhan/razorpay-finance-controller | AssayRunResult}
 * that `@assay/cli`'s `runAssayComposedFull` returned, and this package
 * evaluates no constraint, ranks no candidate, decides no state and reads no
 * threshold.
 *
 * **It is also the only place in the workspace that opens a socket.**
 * `eslint.config.js` bans every transport under `apps/cli/**` — *"selection code
 * that could also open a socket puts a live call one configuration mistake away
 * from the demo path"* — and that ban is unchanged. The division is exact:
 * `apps/cli` is the filesystem door and reaches no network; `apps/api` binds a
 * port and reaches no file, acquiring its observations through `@assay/cli`'s
 * guarded reader.
 */

export { createApp, type ApiOptions } from "./app.js";
export { RunRegistry, type RegistryOptions, type StoredRun } from "./registry.js";
export {
  DEMO_DATASET_IDS,
  isDemoDatasetId,
  observationsPathFor,
  type DemoDatasetId,
} from "./datasets.js";
