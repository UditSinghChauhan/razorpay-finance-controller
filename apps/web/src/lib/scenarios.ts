/**
 * The demo periods the Command Center can start, as **presentation metadata**.
 *
 * **This table is not an allowlist and must never be read as one.**
 * `apps/api/src/datasets.ts` holds the allowlist, resolves a name to a path
 * under `demo/`, and refuses anything else with a `400` whose body names the
 * ids it does support. What lives here is the half the API does not hold and
 * should not: a human label and one sentence of product copy per scenario. A
 * row added here that the API does not allow produces that `400`; it cannot
 * reach a path, a benchmark seed, or a dataset the server did not sanction.
 *
 * **Every scenario is a `demo/` fixture and none of them is benchmark
 * evidence.** `demo/README.md` states the five boundaries in full: outside
 * `bench/`, no seed, no ground truth, never scored, and never usable to support
 * a claim about coverage, accuracy or harm. `demo-close`'s closed period in
 * particular is **not** evidence for `PROJECT_SPEC.md §7`'s `S12`, which reads
 * against the sealed corpus alone.
 *
 * **The descriptions say what the period contains, never what the controller
 * will do with it.** The panel below renders `@assay/controller`'s actual trace;
 * a caption here that predicted an outcome would be a second, unchecked answer
 * sitting next to the real one, and the two could disagree.
 *
 * That prohibition is why each row carries {@link DemoScenario.evidence} rather
 * than an outcome chip. A reviewer scanning four buttons needs to see, without
 * clicking each one, *how the evidence differs* — that is the whole variable in
 * the experiment. What the evidence causes is the panel's answer to give.
 */

export interface DemoScenario {
  /** The id `POST /runs` is called with. Must exist in the API's allowlist. */
  readonly id: string;
  readonly label: string;
  /**
   * The evidence in a handful of words, shown under every button at once.
   *
   * A noun phrase describing what is *in* the period. Never a verb phrase
   * about what happens to it, and never a status: "one ambiguous settlement"
   * is admissible, "escalates one item" is not.
   */
  readonly evidence: string;
  /** What the period holds. Never a claim about the controller's outcome. */
  readonly description: string;
}

export const DEMO_SCENARIOS: readonly DemoScenario[] = Object.freeze([
  Object.freeze({
    id: "demo-500",
    label: "Ambiguity",
    evidence: "One settlement, two admissible allocations",
    description:
      "One settlement whose evidence admits two allocations, beside merchant-ledger " +
      "exceptions that open no Suspense item.",
  }),
  Object.freeze({
    id: "demo-close",
    label: "Clean close",
    evidence: "Nothing in the batch opens a Suspense item",
    description:
      "The same clean traffic with the ambiguous settlement withheld, so nothing left in " +
      "the batch opens a Suspense item.",
  }),
  Object.freeze({
    id: "demo-multi",
    label: "Several items",
    evidence: "Four unattributed bank credits, plus the ambiguity",
    description:
      "Four unattributed bank credits and one large merchant-ledger row on top of the " +
      "ambiguity, so the queue's biggest value opens no Suspense item.",
  }),
  Object.freeze({
    id: "demo-backlog",
    label: "Backlog",
    evidence: "Twenty-four unattributed bank credits",
    description:
      "Twenty-four unattributed bank credits, so the residual is spread across many more " +
      "items than the ambiguity alone.",
  }),
]);

/** The default period, and the one `PROJECT_SPEC.md §10`'s demo script names. */
export const DEFAULT_SCENARIO_ID = "demo-500";

export function scenarioFor(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}

/** The period's human label where one exists, else the raw id the API was given. */
export function scenarioLabel(id: string): string {
  return scenarioFor(id)?.label ?? id;
}
