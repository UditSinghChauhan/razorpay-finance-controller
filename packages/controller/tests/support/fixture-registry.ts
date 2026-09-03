import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CloseReportOutput,
  Certificate,
  DecisionEvidenceOutput,
  ExceptionQueueOutput,
  LedgerVerifyOutput,
  QueueItem,
  ToolRegistry,
} from "../../src/tools.js";

/**
 * A `ToolRegistry` backed by **real, captured `demo-500` evidence** — not a
 * mock and not an invented body.
 *
 * `packages/controller` may not depend on `@assay/cli` or `apps/api`: only an
 * app may depend on a package (`pnpm-workspace.yaml`'s build order —
 * `money → domain → ledger → … → eval → api → web` — has no edge the other
 * way, and `@assay/cli` is a devDependency of the root and of `apps/api`
 * alone). So this suite cannot execute `runAssayComposedFull` itself.
 *
 * What it does instead: the JSON files beside this one were captured, once,
 * from a real `POST /runs` over `demo/demo-500` followed by real `GET`s
 * against `/close`, `/exceptions` and `/decisions/:id` — the same endpoints
 * `apps/api/tests/runs.test.ts` exercises. Every id, certificate field,
 * `evt_id`, hash and paise figure below is the deterministic engine's own
 * output, reshaped into this package's narrower tool schemas. Nothing here is
 * synthesised.
 *
 * `demo/README.md`'s five boundaries still hold: `demo-500` is a product
 * fixture outside `bench/`, carries no benchmark seed, and supports no
 * benchmark claim. Capturing its real output into a committed test fixture
 * does not change that — it is the same "hand-built product fixture, used to
 * exercise a code path" the rest of the product surface already does with it.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures", "demo-500");

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as T;
}

interface RawClose {
  readonly run_id: string;
  readonly period_status: "CLOSED" | "OPEN" | "BLOCKED";
  readonly gate: CloseReportOutput["gate"];
  readonly batch_value_paise: number | null;
  readonly unresolved_value_paise: number;
  readonly value_abstained_paise: number;
  readonly value_exceptions_paise: number;
  readonly close_threshold_paise: number;
  readonly genesis_hash: string;
  readonly ledger_root_hash: string;
  readonly trial_balance_ok: boolean;
  readonly total_dr_paise: number;
  readonly total_cr_paise: number;
  readonly event_count: number;
}

interface RawQueue {
  readonly run_id: string;
  readonly total: number;
  readonly value_abstained_paise: number;
  readonly value_exceptions_paise: number;
  readonly items: readonly QueueItem[];
}

interface RawDecisionBody {
  readonly run_id: string;
  readonly decision: {
    readonly decision_id: string;
    readonly state: DecisionEvidenceOutput["state"];
    readonly kind: string;
    readonly entity_id: string;
    readonly value_paise: number;
    readonly exception_class: string | null;
    readonly suspense_key: string | null;
    readonly comp_id: string | null;
    readonly certificate: {
      readonly comp_id: string;
      readonly reason: Certificate["reason"];
      readonly evidence_score_gap_bps: number;
      readonly epsilon_bps: number;
      readonly materiality_paise: number;
      readonly tau_paise: number;
      readonly probes_attempted: readonly string[];
      readonly shared_hard_constraints: readonly string[];
      readonly solution_a: { readonly member_obs_ids: readonly string[] };
      readonly solution_b: { readonly member_obs_ids: readonly string[] };
    } | null;
  };
  readonly event: {
    readonly evt_id: string;
    readonly seq: number;
    readonly prev_hash: string;
    readonly hash: string;
  };
}

const RAW_CLOSE = load<RawClose>("close");
const RAW_QUEUE = load<RawQueue>("exceptions");
const RAW_AMBIGUOUS = load<RawDecisionBody>("decision-ambiguous");
const RAW_EXCEPTION = load<RawDecisionBody>("decision-exception");

/** `RUN_ID` — the id the real capture was taken under. Every fixture agrees. */
export const RUN_ID = RAW_CLOSE.run_id;

/** The real captured close report, reshaped to this package's schema. */
export const CLOSE_REPORT: CloseReportOutput = Object.freeze({
  run_id: RAW_CLOSE.run_id,
  period_status: RAW_CLOSE.period_status,
  gate: RAW_CLOSE.gate,
  batch_value_paise: RAW_CLOSE.batch_value_paise,
  unresolved_value_paise: RAW_CLOSE.unresolved_value_paise,
  value_abstained_paise: RAW_CLOSE.value_abstained_paise,
  value_exceptions_paise: RAW_CLOSE.value_exceptions_paise,
  close_threshold_paise: RAW_CLOSE.close_threshold_paise,
  ledger_root_hash: RAW_CLOSE.ledger_root_hash,
  genesis_hash: RAW_CLOSE.genesis_hash,
  trial_balance_ok: RAW_CLOSE.trial_balance_ok,
});

/** The real captured queue — all 26 rows, 6 ABSTAINED and 20 EXCEPTION. */
export const EXCEPTION_QUEUE: ExceptionQueueOutput = Object.freeze({
  run_id: RAW_QUEUE.run_id,
  total: RAW_QUEUE.total,
  value_abstained_paise: RAW_QUEUE.value_abstained_paise,
  value_exceptions_paise: RAW_QUEUE.value_exceptions_paise,
  items: RAW_QUEUE.items,
});

function toEvidence(raw: RawDecisionBody): DecisionEvidenceOutput {
  const { decision, event } = raw;
  const cert = decision.certificate;
  return Object.freeze({
    run_id: raw.run_id,
    decision_id: decision.decision_id,
    state: decision.state,
    kind: decision.kind,
    entity_id: decision.entity_id,
    value_paise: decision.value_paise,
    exception_class: decision.exception_class,
    suspense_key: decision.suspense_key,
    comp_id: decision.comp_id,
    certificate:
      cert === null
        ? null
        : Object.freeze({
            comp_id: cert.comp_id,
            reason: cert.reason,
            evidence_score_gap_bps: cert.evidence_score_gap_bps,
            epsilon_bps: cert.epsilon_bps,
            materiality_paise: cert.materiality_paise,
            tau_paise: cert.tau_paise,
            probes_attempted: cert.probes_attempted,
            shared_hard_constraint_count: cert.shared_hard_constraints.length,
            solution_a_member_count: cert.solution_a.member_obs_ids.length,
            solution_b_member_count: cert.solution_b.member_obs_ids.length,
          }),
    // Projected to the four fields the schema declares. `raw.event` is the
    // real captured `LedgerEvent` in full — `run_id`, `ts`, `actor`, `kind`,
    // `subject_ids`, `evidence_ids`, `inputs_hash`, `journal_lines` and
    // `certificate` besides — and `DecisionEvidenceOutputSchema` deliberately
    // does not carry them (`tools.ts`: *"narrow ... so a field silently
    // appearing is a parse failure rather than a surprise"*). Reshaping here,
    // not widening the schema there, is what keeps that boundary real.
    event: {
      evt_id: event.evt_id,
      seq: event.seq,
      prev_hash: event.prev_hash,
      hash: event.hash,
    },
  });
}

/**
 * The one real `ABSTAINED` decision the demo's certificate belongs to —
 * `setl_AMBIG000000000`, `EVIDENCE_TIE`, evidence gap `0` bps against `ε`
 * `1500` bps, materiality ₹590, `τ` ₹204.13. The figures verified live in this
 * session's diagnosis of the Gemini explanation path.
 */
export const AMBIGUOUS_DECISION = toEvidence(RAW_AMBIGUOUS);

/** One real `EXCEPTION`: `E13_LEDGER_ONLY` on a `ledger_entry`, no Suspense key. */
export const EXCEPTION_DECISION = toEvidence(RAW_EXCEPTION);

const DECISIONS_BY_ID = new Map<string, DecisionEvidenceOutput>([
  [AMBIGUOUS_DECISION.decision_id, AMBIGUOUS_DECISION],
  [EXCEPTION_DECISION.decision_id, EXCEPTION_DECISION],
]);

/**
 * An honest `ledger_verify` fixture for this exact, unmodified real chain.
 *
 * `GET /runs/:id/ledger/verify` is `ARCHITECTURE.md §9`'s declared, unbuilt
 * route (this phase's stage 2 builds it in `apps/api`). This fixture does not
 * pretend to have called it: it states what a **correct** implementation must
 * answer for this chain, from facts the real close report already reports —
 * `g4_hash_chain: true` and `trial_balance_ok: true` were true when the
 * engine sealed this run, and a hash chain that has not been touched since
 * (this fixture is read-only JSON) recomputes to the same root by
 * construction. `total_dr_paise` / `total_cr_paise` / `event_count` are the
 * real captured totals, not recomputed here a second time.
 */
export const LEDGER_VERIFY: LedgerVerifyOutput = Object.freeze({
  run_id: RAW_CLOSE.run_id,
  chain_ok: RAW_CLOSE.gate.g4_hash_chain,
  recomputed_root_hash: RAW_CLOSE.ledger_root_hash,
  stored_root_hash: RAW_CLOSE.ledger_root_hash,
  root_matches: RAW_CLOSE.gate.g4_hash_chain,
  trial_balance_ok: RAW_CLOSE.trial_balance_ok,
  total_dr_paise: RAW_CLOSE.total_dr_paise,
  total_cr_paise: RAW_CLOSE.total_cr_paise,
  event_count: RAW_CLOSE.event_count,
  checks: Object.freeze([
    Object.freeze({ name: "genesis_to_root", passed: RAW_CLOSE.gate.g4_hash_chain }),
    Object.freeze({ name: "trial_balance", passed: RAW_CLOSE.trial_balance_ok }),
    Object.freeze({ name: "suspense_identity", passed: RAW_CLOSE.gate.g3_suspense_identity }),
  ]),
});

/** Build a registry over the real fixtures. `overrides` replaces one function. */
export function fixtureRegistry(overrides: Partial<ToolRegistry> = {}): ToolRegistry {
  return {
    ledger_verify: async () => LEDGER_VERIFY,
    close_report: async () => CLOSE_REPORT,
    exception_queue: async () => EXCEPTION_QUEUE,
    decision_evidence: async ({ decision_id }) => {
      const found = DECISIONS_BY_ID.get(decision_id);
      if (found === undefined) {
        throw new Error(`no fixture decision for ${decision_id}`);
      }
      return found;
    },
    ...overrides,
  };
}
