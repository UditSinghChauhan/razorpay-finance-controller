import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { RunContext } from "../src/context/RunContext.js";
import type { ApiState, LedgerVerification } from "../src/hooks/useAssayApi.js";
import { AuditLogs, ChainVerification } from "../src/pages/AuditLogs.js";
import { CLOSE_500, RUN, runContext } from "./fixtures.js";

/**
 * The Audit Logs page, rendered through `renderToStaticMarkup` — the technique
 * `controller-panel.test.tsx` and `ai-explanation.test.tsx` use, so what is
 * asserted is the markup the component actually produces.
 *
 * **The verified fixture is not invented.** Every figure in `VERIFIED` below is
 * read off `fixtures.ts`'s `CLOSE_500`, which was recorded from a real
 * `POST /runs` over `demo/demo-500`, and the equalities that make the
 * derivation valid are the ones `apps/api/tests/ledger-verify.test.ts` asserts
 * against a live run:
 *
 * ```
 *   verify.recomputed_root_hash === close.ledger_root_hash
 *   verify.trial_balance_ok     === close.trial_balance_ok
 *   verify.total_dr_paise       === close.total_dr_paise
 *   verify.total_cr_paise       === close.total_cr_paise
 * ```
 *
 * So a drift between what the route returns and what this file renders fails
 * over there, against the running API, rather than passing quietly here.
 *
 * `TAMPERED` is the one constructed fixture and is constructed on purpose: no
 * run in this repository has a broken chain, and the failure branch is the
 * branch that matters most. It is built by flipping the four verdicts and
 * substituting a different recomputed root — nothing else — so what the
 * failure tests prove is that the component reads those fields rather than
 * rendering a fixed success page.
 */

const VERIFIED: LedgerVerification = {
  run_id: RUN.run_id,
  chain_ok: true,
  recomputed_root_hash: CLOSE_500.ledger_root_hash,
  stored_root_hash: CLOSE_500.ledger_root_hash,
  root_matches: true,
  trial_balance_ok: CLOSE_500.trial_balance_ok,
  total_dr_paise: CLOSE_500.total_dr_paise,
  total_cr_paise: CLOSE_500.total_cr_paise,
  event_count: CLOSE_500.event_count,
  checks: [
    { name: "genesis_to_root", passed: true },
    { name: "trial_balance", passed: true },
    { name: "suspense_identity", passed: true },
  ],
};

/**
 * A chain that does not recompute. Deliberately shares a 16-character prefix
 * with the stored root, which is exactly the case abbreviation would hide.
 */
const TAMPERED_ROOT = `${CLOSE_500.ledger_root_hash.slice(0, 16)}${"0".repeat(48)}`;

const TAMPERED: LedgerVerification = {
  ...VERIFIED,
  chain_ok: false,
  recomputed_root_hash: TAMPERED_ROOT,
  root_matches: false,
  trial_balance_ok: false,
  total_cr_paise: VERIFIED.total_cr_paise - 1,
  checks: [
    { name: "genesis_to_root", passed: false },
    { name: "trial_balance", passed: false },
    { name: "suspense_identity", passed: false },
  ],
};

function state(overrides: Partial<ApiState<LedgerVerification>> = {}): ApiState<LedgerVerification> {
  return { data: null, loading: false, error: null, ...overrides };
}

function render(s: ApiState<LedgerVerification>, runId: string = RUN.run_id): string {
  return renderToStaticMarkup(
    <ChainVerification
      runId={runId}
      state={s}
      onVerify={() => undefined}
      onEvidenceClick={() => undefined}
    />,
  );
}

// ---------------------------------------------------------------------------
// The action, and the claim it makes
// ---------------------------------------------------------------------------

describe("the verification action", () => {
  const html = render(state());

  it("offers 'Verify chain from genesis' before anything has been run", () => {
    expect(html).toContain("Verify chain from genesis");
  });

  it("says the chain is recomputed, not that a cached flag is read", () => {
    expect(html).toContain("This does not read a stored verdict");
    expect(html).toContain("re-hashes every event in sequence");
    expect(html).toContain("genesis hash forward");
    expect(html).toContain("hash-chain flag is not consulted");
  });

  it("names the one check that is NOT recomputed, rather than implying all three are", () => {
    expect(html).toContain("The one exception is the Suspense identity");
    expect(html).toContain("reported from the sealed close gate");
  });

  it("shows nothing of a result it has not fetched", () => {
    expect(html).toContain("Not yet verified");
    expect(html).not.toContain("Chain verified");
    expect(html).not.toContain("Verification failed");
    expect(html).not.toContain("Events re-hashed");
  });
});

// ---------------------------------------------------------------------------
// Successful verification
// ---------------------------------------------------------------------------

describe("a successful verification", () => {
  const html = render(state({ data: VERIFIED }));

  it("reports the chain verified", () => {
    expect(html).toContain("Chain verified");
    expect(html).not.toContain("Verification failed");
  });

  it("renders chain_ok, root_matches and trial_balance_ok as the response gives them", () => {
    expect(html).toContain("Chain integrity");
    expect(html).toContain(">Intact<");
    expect(html).toContain("Root matches");
    expect(html).toContain(">Yes<");
    expect(html).toContain(">Balanced<");
    expect(html).not.toContain(">Broken<");
    expect(html).not.toContain(">Not balanced<");
  });

  it("shows the recomputed root beside the stored one, and reports them equal", () => {
    expect(html).toContain("Recomputed from genesis");
    expect(html).toContain("Stored on the run");
    expect(html).toContain("Roots match");
    expect(html).not.toContain("Roots differ");
  });

  it("abbreviates the matching hashes behind a disclosure control", () => {
    // Progressive disclosure: the prefix is on screen, the remaining 48
    // characters are behind the toggle, and the toggle is offered.
    expect(html).toContain(CLOSE_500.ledger_root_hash.slice(0, 16));
    expect(html).not.toContain(CLOSE_500.ledger_root_hash);
    expect(html).toContain("Show full hashes");
  });

  it("shows total debit, total credit and the balanced verdict", () => {
    expect(html).toContain("Total debit");
    expect(html).toContain("Total credit");
    expect(html).toContain("Verdict");
    // ₹25,94,747.18 both sides — the recorded demo-500 totals, formatted.
    expect(html).toContain("25,94,747.18");
  });

  it("shows the event count the recomputation covered", () => {
    expect(html).toContain("Events re-hashed");
    expect(html).toContain(">490<");
  });

  it("names all three checks by the API's own names, and marks each PASS", () => {
    for (const name of ["genesis_to_root", "trial_balance", "suspense_identity"]) {
      expect(html, name).toContain(name);
    }
    expect(html).toContain("PASS");
    expect(html).not.toContain("FAIL");
  });

  it("distinguishes what was recomputed from what was read off the seal", () => {
    expect(html).toContain("Recomputed by this request");
    expect(html).toContain("Read from the sealed close gate");
    expect(html).toContain("This one is not recomputed here");
  });

  it("does not fabricate a timestamp, an actor or an event history", () => {
    // The page reports a COUNT of events and says where the events themselves
    // live. It invents no time, no person and no row.
    expect(html).toContain("reports them as a count");
    expect(html).toContain("Evidence Trail for the decision that caused it");
    for (const forbidden of ["Verified at", "Last verified", "Timestamp", "Actor", "deterministic /"]) {
      expect(html, forbidden).not.toContain(forbidden);
    }
  });

  it("renders the response's own run_id, labelled as the response's", () => {
    expect(html).toContain("response run_id");
    expect(html).toContain(RUN.run_id);
  });
});

// ---------------------------------------------------------------------------
// Failed verification
// ---------------------------------------------------------------------------

describe("a failed verification", () => {
  const html = render(state({ data: TAMPERED }));

  it("reports the verification failed", () => {
    expect(html).toContain("Verification failed");
    expect(html).not.toContain("Chain verified");
  });

  it("renders every verdict as the failing response gives it", () => {
    expect(html).toContain(">Broken<");
    expect(html).toContain(">No<");
    expect(html).toContain(">Not balanced<");
    expect(html).toContain("Roots differ");
    expect(html).not.toContain(">Intact<");
    expect(html).not.toContain("Roots match");
  });

  it("shows BOTH roots in full when they differ, and offers no abbreviation", () => {
    // The two fixtures share a 16-character prefix on purpose. Abbreviating
    // here would render a broken chain as an intact one.
    expect(html).toContain(TAMPERED.recomputed_root_hash);
    expect(html).toContain(TAMPERED.stored_root_hash);
    expect(html).not.toContain("Show full hashes");
  });

  it("marks each named check FAIL", () => {
    expect(html).toContain("FAIL");
    expect(html).not.toContain("PASS");
  });

  it("states that verification reads the chain rather than repairing it", () => {
    expect(html).toContain("verification reads the chain, it does not repair it");
  });
});

// ---------------------------------------------------------------------------
// Loading, error, no run
// ---------------------------------------------------------------------------

describe("the loading state", () => {
  const html = render(state({ loading: true }));

  it("says what is being recomputed and disables the action", () => {
    expect(html).toContain("Recomputing the chain from genesis");
    expect(html).toContain("loading-spinner");
    expect(html).toContain("Verifying…");
    expect(html).toContain("disabled");
  });

  it("claims no verdict while it is still running", () => {
    expect(html).not.toContain("Chain verified");
    expect(html).not.toContain("Verification failed");
    expect(html).not.toContain("Not yet verified");
  });
});

describe("the error state", () => {
  // apps/api's own 404 sentence, which the hook surfaces in place of "404".
  const message =
    "No run run_missing is held by this process. Runs live in memory for the life of " +
    "the server, so a run started before a restart is gone. POST /runs to start one.";
  const html = render(state({ error: message }));

  it("shows the server's stated reason", () => {
    expect(html).toContain("Verification could not be run");
    expect(html).toContain("Runs live in memory for the life of the server");
  });

  it("does not let a failed request read as a failed check", () => {
    expect(html).toContain("No check ran, so nothing is known either way about this chain");
    expect(html).not.toContain("Verification failed");
    expect(html).not.toContain("Chain verified");
  });
});

describe("the page with no active run", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <RunContext.Provider value={runContext({ run: null })}>
        <AuditLogs />
      </RunContext.Provider>
    </MemoryRouter>,
  );

  it("says there is nothing to verify, and offers to start a run", () => {
    expect(html).toContain("Verify Ledger");
    expect(html).toContain("No active run");
    expect(html).toContain("Run Demo");
  });

  it("offers no verification action and shows no verdict", () => {
    expect(html).not.toContain("Verify chain from genesis");
    expect(html).not.toContain("Chain verified");
    expect(html).not.toContain("Events re-hashed");
  });
});

describe("the page takes its run from RunContext", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <RunContext.Provider value={runContext()}>
        <AuditLogs />
      </RunContext.Provider>
    </MemoryRouter>,
  );

  it("renders the context's run id and the idle action", () => {
    expect(html).toContain(RUN.run_id);
    expect(html).toContain("Verify chain from genesis");
  });

  it("fetches nothing on mount — the verification is the reviewer's action", () => {
    expect(html).toContain("Not yet verified");
    expect(html).not.toContain("Chain verified");
  });
});

// ---------------------------------------------------------------------------
// The figures come from the response
// ---------------------------------------------------------------------------

/**
 * The same component, given a response carrying none of `demo-500`'s values,
 * renders that response instead.
 *
 * `apps/web/tests/` has no filesystem access, so this is proved by
 * construction rather than by grepping the source: a wholly synthetic body
 * produces wholly synthetic output, which could only happen if every figure is
 * read from the prop.
 */
describe("every figure is read from the response, not hardcoded", () => {
  const SYNTHETIC: LedgerVerification = {
    run_id: "run_synthetic_0000000000000000000000000000000000000000000000000000",
    chain_ok: true,
    recomputed_root_hash: "1".repeat(64),
    stored_root_hash: "1".repeat(64),
    root_matches: true,
    trial_balance_ok: true,
    total_dr_paise: 12_345,
    total_cr_paise: 12_345,
    event_count: 7,
    checks: [
      { name: "genesis_to_root", passed: true },
      { name: "trial_balance", passed: true },
      { name: "suspense_identity", passed: true },
    ],
  };

  // The runId prop is the synthetic one too: the action bar names the run the
  // page is pointed at (RunContext's) and the result banner names the run the
  // RESPONSE reported, so leaving the prop as demo-500's would put a real id on
  // screen for an honest reason and defeat the check below.
  const html = render(state({ data: SYNTHETIC }), SYNTHETIC.run_id);

  it("renders the synthetic run id, root, totals and event count", () => {
    expect(html).toContain(SYNTHETIC.run_id);
    expect(html).toContain("1".repeat(16));
    expect(html).toContain("123.45");
    expect(html).toContain(">7<");
  });

  it("carries none of demo-500's own figures when the response does not", () => {
    expect(html).not.toContain(CLOSE_500.ledger_root_hash.slice(0, 16));
    expect(html).not.toContain("25,94,747.18");
    expect(html).not.toContain(">490<");
    expect(html).not.toContain(RUN.run_id);
  });

  it("still reports verified — the verdict tracks the checks it was given", () => {
    expect(html).toContain("Chain verified");
  });

  it("reports a response naming no check as unverified rather than as a pass", () => {
    const empty = render(state({ data: { ...SYNTHETIC, checks: [] } }), SYNTHETIC.run_id);
    expect(empty).toContain("Verification failed");
    expect(empty).not.toContain("Chain verified");
  });
});
