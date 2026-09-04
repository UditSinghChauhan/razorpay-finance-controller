import type {
  CertificateAllocation,
  CloseReport,
  DecisionDetail,
  ExceptionsResponse,
  RunSummary,
} from "../src/hooks/useAssayApi.js";
import type { RunContextValue } from "../src/context/RunContext.js";

/**
 * Recorded responses from a real `POST /runs` over `demo/demo-500`.
 *
 * **Every figure below was read off the running API, not chosen.** They are here
 * so a component can be rendered without a live server; they are not stand-ins
 * for values the API does not produce. `apps/api/tests/allocation.test.ts`
 * asserts the same quantities against a live run, so a drift between this file
 * and the engine fails there rather than silently passing here.
 *
 * The dataset is `demo/demo-500`, which `demo/README.md` places outside
 * `bench/`: nothing here is benchmark data and no number below is a measurement.
 */

/** `POST /runs` — the two abstention counts are 1 decision over 6 observations. */
export const RUN: RunSummary = {
  run_id: "run_1aced16fd786c5c2ebb91b7a0a0274303316dc8b0ed14e762591a4550b228eb9",
  dataset: "demo-500",
  agent_id: "ASSAY",
  llm_provider: "offline",
  observation_count: 500,
  summary: {
    observation_states: { RECONCILED: 464, EXCEPTION: 20, REFERENCE: 10, ABSTAINED: 6 },
    decisions: 490,
    abstentions: 1,
    open_exceptions: 20,
    certificates: 1,
    probes_spent: 0,
    period_status: "OPEN",
    unresolved_value_paise: 10_000_000,
    batch_value_paise: 134_943_859,
    ledger_root_hash: "a491a3759c91a4efd6f781007a32b015ac5329b05bbcb192f0f76b5ff32530ad",
    event_count: 490,
  },
};

const COMP_ID = "comp_58b9b393e020198ac22f26c0c6d9d4c57bb9867ae7d86b39cb9b28c10803fcbb";
const CAND_A = "cand_96a0b4b7672a9c6ed51d2dfb273c1a4b97be32672a299f390003c910bdec0a40";
const CAND_B = "cand_6b0842f74ea28c608b1d4f2574be8963ab9d6ddcff2f72e9d6e2c3dabfeff8d1";

export const CANDIDATE_A_ID = CAND_A;
export const CANDIDATE_B_ID = CAND_B;

/** The certificate's two solutions, named exactly as `DATA_MODEL.md §13` names them. */
export const SOLUTION_A = {
  candidate_id: CAND_A,
  member_obs_ids: ["obs_reconline00001", "obs_reconline00002", "obs_reconline00003"],
} as const;

export const SOLUTION_B = {
  candidate_id: CAND_B,
  member_obs_ids: ["obs_reconline00004", "obs_reconline00005"],
} as const;

/**
 * `apps/api`'s read model for the same certificate.
 *
 * `allocation_paise` is C6's per-member term and `value_paise` is §14.1's
 * gross value; the two differ by the line's fee, which is why both are carried.
 */
export const ALLOCATION: CertificateAllocation = {
  comp_id: COMP_ID,
  target: {
    obs_id: "obs_settlement00001",
    entity_id: "setl_AMBIG000000000",
    value_paise: 10_000_000,
  },
  solution_a: {
    candidate_id: CAND_A,
    members: [
      { obs_id: "obs_reconline00001", allocation_paise: 5_000_000, value_paise: 5_118_000 },
      { obs_id: "obs_reconline00002", allocation_paise: 3_000_000, value_paise: 3_070_800 },
      { obs_id: "obs_reconline00003", allocation_paise: 2_000_000, value_paise: 2_047_200 },
    ],
  },
  solution_b: {
    candidate_id: CAND_B,
    members: [
      { obs_id: "obs_reconline00004", allocation_paise: 6_000_000, value_paise: 6_106_200 },
      { obs_id: "obs_reconline00005", allocation_paise: 4_000_000, value_paise: 4_070_800 },
    ],
  },
};

/** The abstained target's drill-down, with its sealed §16 event. */
export const DECISION_DETAIL: DecisionDetail = {
  run_id: RUN.run_id,
  decision: {
    decision_id: "dec_23df904919bd73d10ae22d8fffb4a288af5a8a154c8368100a727e11485ac875",
    obs_id: "obs_settlement00001",
    entity_id: "setl_AMBIG000000000",
    kind: "settlement",
    state: "ABSTAINED",
    exception_class: null,
    suspense_key: "setl_AMBIG000000000",
    value_paise: 10_000_000,
    journal_lines: [
      {
        account: "1100_GATEWAY_RECEIVABLE",
        dr_paise: 0,
        cr_paise: 10_000_000,
        memo_ref: "P6",
        source_entity_id: "setl_AMBIG000000000",
      },
      {
        account: "9000_SUSPENSE_UNRECONCILED",
        dr_paise: 10_000_000,
        cr_paise: 0,
        memo_ref: "P6",
        source_entity_id: "setl_AMBIG000000000",
      },
    ],
    comp_id: COMP_ID,
    certificate: {
      comp_id: COMP_ID,
      solution_a: { ...SOLUTION_A, member_obs_ids: [...SOLUTION_A.member_obs_ids] },
      solution_b: { ...SOLUTION_B, member_obs_ids: [...SOLUTION_B.member_obs_ids] },
      shared_hard_constraints: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"],
      evidence_score_gap_bps: 0,
      materiality_paise: 59_000,
      epsilon_bps: 1500,
      tau_paise: 20_413,
      probes_attempted: [],
      reason: "EVIDENCE_TIE",
    },
    evt_id: "evt_23df904919bd73d10ae22d8fffb4a288af5a8a154c8368100a727e11485ac875",
  },
  event: {
    evt_id: "evt_23df904919bd73d10ae22d8fffb4a288af5a8a154c8368100a727e11485ac875",
    run_id: RUN.run_id,
    ts: 1_751_328_000,
    // §16's actor block: `type` and `component`, and no `id`.
    actor: {
      type: "deterministic",
      component: "engine.s5_validate",
      engine_commit: "1.4.37",
      llm_provider: null,
      model_id: null,
      prompt_hash: null,
      llm_call_id: null,
    },
    kind: "ABSTAIN",
    subject_ids: ["obs_settlement00001"],
    evidence_ids: [],
    decision_id: "dec_23df904919bd73d10ae22d8fffb4a288af5a8a154c8368100a727e11485ac875",
    inputs_hash: "0".repeat(64),
    journal_lines: [],
    certificate: null,
    seq: 1,
    prev_hash: "0".repeat(64),
    hash: "1".repeat(64),
  },
  certificate_allocation: ALLOCATION,
};

/** The queue: six abstained observation rows, one exception row, value-ranked. */
export const EXCEPTIONS: ExceptionsResponse = {
  run_id: RUN.run_id,
  total: 7,
  value_abstained_paise: 10_000_000,
  value_exceptions_paise: 479_253,
  items: [
    {
      decision_id: "dec_23df904919bd73d10ae22d8fffb4a288af5a8a154c8368100a727e11485ac875",
      obs_id: "obs_settlement00001",
      entity_id: "setl_AMBIG000000000",
      kind: "settlement",
      state: "ABSTAINED",
      value_paise: 10_000_000,
      exception_class: null,
      suspense_key: "setl_AMBIG000000000",
      comp_id: COMP_ID,
      evt_id: "evt_23df904919bd73d10ae22d8fffb4a288af5a8a154c8368100a727e11485ac875",
      has_certificate: true,
    },
    ...(
      [
        ["obs_reconline00004", "pay_AMBD0000000000", 6_106_200],
        ["obs_reconline00001", "pay_AMBA0000000000", 5_118_000],
        ["obs_reconline00005", "pay_AMBE0000000000", 4_070_800],
        ["obs_reconline00002", "pay_AMBB0000000000", 3_070_800],
        ["obs_reconline00003", "pay_AMBC0000000000", 2_047_200],
      ] as const
    ).map(([obsId, entityId, value]) => ({
      decision_id: `dec_${obsId}`,
      obs_id: obsId,
      entity_id: entityId,
      kind: "recon_line",
      state: "ABSTAINED" as const,
      value_paise: value,
      exception_class: null,
      suspense_key: null,
      comp_id: COMP_ID,
      evt_id: `evt_${obsId}`,
      has_certificate: true,
    })),
    {
      decision_id: "dec_52d78778981a36ab7ddd58d907a8b3be204cdec0d2dc57a975bb56e8d183dd6d",
      obs_id: "obs_ledgerentry00009",
      entity_id: "mle_DEMO0080000000",
      kind: "ledger_entry",
      state: "EXCEPTION",
      value_paise: 479_253,
      exception_class: "E13_LEDGER_ONLY",
      suspense_key: null,
      comp_id: null,
      evt_id: "evt_52d78778981a36ab7ddd58d907a8b3be204cdec0d2dc57a975bb56e8d183dd6d",
      has_certificate: false,
    },
  ],
};

/** A context value a page can be rendered against without a live API. */
/**
 * `GET /runs/:id/close` over a period that CLOSED — the `demo-close` shape.
 *
 * Every figure was read off a live run of `demo/demo-close`, which holds twenty
 * open `E13_LEDGER_ONLY` exceptions and no abstention at all: `§17.1.1` gives a
 * `ledger_entry` no posting in any state, so none of them opens a Suspense item
 * and `G3`'s residual is exactly zero. It is here so a page can be rendered for
 * a period whose headline fact is that it closed — the case the Command Center
 * previously had no fixture for, because `demo-500` never produces it.
 */
export const CLOSE_CLOSED: CloseReport = {
  run_id: "run_cc2aa4476d82276c4a87d61c94fc4023b04dedf07c4d60815044b05af5826270",
  period_status: "CLOSED",
  gate: {
    g1_all_terminal: true,
    g2_trial_balance: true,
    g3_suspense_identity: true,
    g4_hash_chain: true,
    g5_no_failed_invariant_posted: true,
    failed_gates: [],
  },
  batch_value_paise: 114_530_859,
  unresolved_value_paise: 0,
  value_abstained_paise: 0,
  value_exceptions_paise: 0,
  suspense_gross_item_paise: 0,
  suspense_balance_paise: 0,
  trial_balance_ok: true,
  total_dr_paise: 229_061_718,
  total_cr_paise: 229_061_718,
  account_balances: {},
  genesis_hash: "5ba81036207621968bb8fc946baa859191fbdd7d627be658d48866b78d182fc3",
  ledger_root_hash: "57f989e97ddd7c5849c01d4e8863de736f38eda83b0c0f0e76ad9e8ac25f98a0",
  event_count: 483,
  journal_line_count: 2_418,
  close_threshold_paise: 572_654,
  // `§10.2`'s close report artifact. Omitted rather than transcribed: it is a
  // large nested object, no surface under test reads it, and the pages take
  // every figure they show from the flat fields above. On a live OPEN or
  // CLOSED run this field is non-null.
  report: null,
};

/**
 * `GET /runs/:id/close` over a period whose residual has TWO halves — the
 * `demo-multi` shape.
 *
 * Every figure was read off a live run of `demo/demo-multi`. It is here because
 * it is the one shape that separates `DATA_MODEL.md §20`'s split: the residual
 * is ₹1,89,000, of which ₹1,00,000 is the abstained settlement and ₹89,000 is
 * four unattributed bank credits that reached `E03` and opened Suspense items
 * of their own. On `demo-500` those two figures are equal, so a panel that
 * showed the residual where it meant the abstained value read correctly by
 * coincidence and no fixture could catch it.
 */
export const CLOSE_MULTI: CloseReport = {
  run_id: "run_aba602a5968ef868ebb4eb97d30ada5a80b9b82238d8c9bbc26e5e1406d73c7d",
  period_status: "OPEN",
  gate: {
    g1_all_terminal: true,
    g2_trial_balance: true,
    g3_suspense_identity: true,
    g4_hash_chain: true,
    g5_no_failed_invariant_posted: true,
    failed_gates: [],
  },
  batch_value_paise: 134_943_859,
  unresolved_value_paise: 18_900_000,
  value_abstained_paise: 10_000_000,
  value_exceptions_paise: 8_900_000,
  suspense_gross_item_paise: 18_900_000,
  suspense_balance_paise: 1_100_000,
  trial_balance_ok: true,
  total_dr_paise: 268_374_718,
  total_cr_paise: 268_374_718,
  account_balances: {},
  genesis_hash: "0c727f80876b6396a2cea4c3fe6904de70cfd7a0a7a682491d25ec8ed1279b6f",
  ledger_root_hash: "edd2fa985e451b9e684f8db3bc394da40178382551152fba6e08ca6b3eb4bc3f",
  event_count: 495,
  journal_line_count: 2_438,
  close_threshold_paise: 674_719,
  // `§10.2`'s close report artifact. Omitted rather than transcribed: it is a
  // large nested object, no surface under test reads it, and the pages take
  // every figure they show from the flat fields above. On a live OPEN or
  // CLOSED run this field is non-null.
  report: null,
};

/**
 * `GET /runs/:id/close` over `demo-500` — the period where the two halves of
 * `§20`'s split coincide, so the abstained value and the residual are both
 * ₹1,00,000 and the exception half is zero.
 */
export const CLOSE_500: CloseReport = {
  run_id: RUN.run_id,
  period_status: "OPEN",
  gate: {
    g1_all_terminal: true,
    g2_trial_balance: true,
    g3_suspense_identity: true,
    g4_hash_chain: true,
    g5_no_failed_invariant_posted: true,
    failed_gates: [],
  },
  batch_value_paise: 134_943_859,
  unresolved_value_paise: 10_000_000,
  value_abstained_paise: 10_000_000,
  value_exceptions_paise: 0,
  suspense_gross_item_paise: 10_000_000,
  suspense_balance_paise: 10_000_000,
  trial_balance_ok: true,
  total_dr_paise: 259_474_718,
  total_cr_paise: 259_474_718,
  account_balances: {},
  genesis_hash: "8a51faa670358bfbb38c9657a8620ec2988cc7fc305c4be875a0ccf1060026b1",
  ledger_root_hash: "f4c9c7a962be138423636b94c8c431ebf6bb9a30a76e1e56d70d5769e6a68124",
  event_count: 490,
  journal_line_count: 2_430,
  close_threshold_paise: 674_719,
  // `§10.2`'s close report artifact. Omitted rather than transcribed: it is a
  // large nested object, no surface under test reads it, and the pages take
  // every figure they show from the flat fields above. On a live OPEN or
  // CLOSED run this field is non-null.
  report: null,
};

export function runContext(overrides: Partial<RunContextValue> = {}): RunContextValue {
  return {
    run: RUN,
    close: null,
    exceptions: EXCEPTIONS,
    selectedDecisionId: null,
    dataset: "demo-500",
    loading: false,
    error: null,
    startDemo: () => Promise.resolve(),
    selectDataset: () => undefined,
    selectDecision: () => undefined,
    // The default is a first visit: no pointer was stored, so nothing is
    // being restored and no page is gated. A test that wants the restoring,
    // not-found or unreachable screen overrides this one field.
    rehydrate: { kind: "idle" },
    retryRehydrate: () => undefined,
    ...overrides,
  };
}
