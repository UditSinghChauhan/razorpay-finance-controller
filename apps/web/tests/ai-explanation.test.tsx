import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AiExplanationLoading,
  AiExplanationPrompt,
  AiExplanationResult,
} from "../src/components/AiExplanation.js";
import type { ExplanationResponse } from "../src/hooks/useAssayApi.js";
import { DECISION_DETAIL, RUN } from "./fixtures.js";

/**
 * The "Explain with AI" panel — every state it can be in, rendered through
 * `renderToStaticMarkup` so what is asserted is the markup the component
 * actually produces.
 *
 * **The point of these tests is what the page keeps showing when the AI does
 * not.** A provider that is unreachable, a credential that is missing and a
 * response that boundary 2 discarded must each leave the deterministic verdict
 * on screen and put no model-authored conclusion in its place.
 */

const DECISION = DECISION_DETAIL.decision;

function markup(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

/** React escapes apostrophes in text nodes; an assertion has to speak markup. */
function escaped(text: string): string {
  return text.replaceAll("'", "&#x27;");
}

/** A grounding block in the shape apps/api returns it. */
function grounding(
  overrides: Partial<ExplanationResponse["grounding"]> = {},
): ExplanationResponse["grounding"] {
  return {
    decision_evidence_verified: true,
    certificate_used: true,
    decision_authority: "none",
    deterministic_state: "ABSTAINED",
    checks: { schema: "pass", allowlist: "pass", numerals: "pass" },
    rejected_entity_ids: [],
    rejected_numerals: [],
    system_prompt_id: "r4_explain_decision.assay.v1",
    system_prompt_hash: "a".repeat(64),
    input_hash: "b".repeat(64),
    cache_key: "c".repeat(64),
    evidence_item_count: 41,
    ...overrides,
  };
}

function response(overrides: Partial<ExplanationResponse> = {}): ExplanationResponse {
  return {
    run_id: RUN.run_id,
    decision_id: DECISION.decision_id,
    audience: "analyst",
    status: "ok",
    explanation: {
      summary:
        "ASSAY abstained because two valid explanations remain materially indistinguishable " +
        "under the available evidence.",
      why: [
        "Both candidate allocations satisfy all eight shared hard constraints.",
        "The evidence score gap is 0 bps, inside the 1500 bps epsilon.",
      ],
      risk: "The settlement stays in Suspense and the period cannot close on it.",
      next_step: "Obtain a bank-side reference that names one allocation, then re-run.",
    },
    provider: {
      provider: "anthropic",
      model_id: "claude-opus-5",
      requires_network: true,
      attempts: 1,
      latency_ms: 2100,
    },
    grounding: grounding(),
    fallback: null,
    failure: null,
    ...overrides,
  };
}

/** The deterministic summary, in the shape apps/api serves it on `unavailable`. */
function fallback(
  overrides: Partial<NonNullable<ExplanationResponse["fallback"]>> = {},
): NonNullable<ExplanationResponse["fallback"]> {
  return {
    label: "Evidence summary — AI unavailable",
    generated_by: "assay-deterministic",
    summary:
      "ASSAY abstained on this observation and attached an ambiguity certificate. This is " +
      "ASSAY's own record of the evidence, written by the engine because no AI explanation " +
      "was available. It adds nothing to the decision and interprets nothing.",
    points: [
      "Certificate reason recorded by the engine: TWO_VALID_ALLOCATIONS.",
      "The evidence score gap is 0 bps against a pre-registered margin of 1500 bps.",
    ],
    risk: "Unresolved value across this close is ₹1,00,000.00 (10000000 paise), and the period status is OPEN.",
    next_step:
      "The certificate and the ledger on this page are complete and unaffected. Read them " +
      "directly, or retry the AI explanation once the provider is configured and reachable.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 6. A successful explanation renders in the UI.
// ---------------------------------------------------------------------------

describe("before the click", () => {
  const idle = markup(<AiExplanationPrompt onExplain={() => undefined} />);

  it("offers the button §5 specifies, under the two labels it specifies", () => {
    expect(idle).toContain("Explain with AI");
    expect(idle).toContain("AI explanation");
    expect(idle).toContain("Grounded in ASSAY evidence");
  });

  it("says what the AI may and may not do before it is asked", () => {
    expect(idle).toContain("ASSAY has already made this decision");
    expect(idle).toContain("cannot change the certificate");
  });

  it("shows no explanation, and no placeholder pretending to be one", () => {
    expect(idle).not.toContain("Coming soon");
    expect(idle).not.toContain("Why</p>");
  });
});

describe("the loading state", () => {
  const loading = markup(<AiExplanationLoading />);

  it("is a real loading state, not an empty panel", () => {
    expect(loading).toContain("loading-spinner");
    expect(loading).toContain("Reading the verified evidence");
  });

  it("says the decision is already final while it waits", () => {
    expect(loading).toContain("The decision is already final");
  });
});

describe("a successful explanation", () => {
  const ok = markup(<AiExplanationResult response={response()} />);

  it("renders all four explanation fields and nothing else from the model", () => {
    expect(ok).toContain("materially indistinguishable");
    expect(ok).toContain("shared hard constraints");
    expect(ok).toContain("Risk while unresolved");
    expect(ok).toContain("stays in Suspense");
    expect(ok).toContain("Suggested next step");
    expect(ok).toContain("Obtain a bank-side reference");
  });

  it("keeps ASSAY's verdict visible inside the AI panel itself", () => {
    expect(ok).toContain("ABSTAINED");
    expect(ok).toContain("decided deterministically");
    expect(ok).toContain("not by the model");
  });

  it("shows §5's three grounding indicators", () => {
    expect(ok).toContain("Decision evidence verified");
    expect(ok).toContain("Certificate used");
    expect(ok).toContain("No decision authority");
  });

  it("reports which checks ran, and the model that answered", () => {
    expect(ok).toContain("schema passed");
    expect(ok).toContain("identifiers passed");
    expect(ok).toContain("figures passed");
    expect(ok).toContain("claude-opus-5");
    expect(ok).toContain("41 verified evidence items");
  });

  it("exposes a prompt hash and never a prompt", () => {
    expect(ok).toContain("r4_explain_decision.assay.v1");
    expect(ok).toContain("aaaaaaaaaaaa");
    expect(ok).not.toContain("ALREADY BEEN MADE");
    expect(ok).not.toContain("GROUNDING RULES");
    expect(ok).not.toContain("You are explaining");
  });

  it("puts no rupee figure of its own on screen", () => {
    // Every amount on this page comes from the certificate above the panel.
    // The panel renders the model's prose and the run's own metadata only.
    expect(ok).not.toContain("₹");
  });
});

// ---------------------------------------------------------------------------
// 7. Provider failure produces a safe UI state.
// ---------------------------------------------------------------------------

describe("when the provider fails, the certificate is what remains", () => {
  const cases: readonly [string, ExplanationResponse][] = [
    [
      "no credential is configured",
      response({
        status: "unavailable",
        explanation: null,
        provider: null,
        grounding: grounding({
          checks: { schema: "not_reached", allowlist: "not_reached", numerals: "not_reached" },
          system_prompt_id: null,
          system_prompt_hash: "",
          evidence_item_count: 0,
        }),
        failure: {
          code: "MISSING_CREDENTIAL",
          message:
            "No provider credential is configured on the server. Set ANTHROPIC_API_KEY in " +
            "the API process environment to enable AI explanations. ASSAY's decision, " +
            "certificate and ledger are unaffected.",
        },
      }),
    ],
    [
      "the provider is unreachable",
      response({
        status: "unavailable",
        explanation: null,
        failure: { code: "PROVIDER_UNAVAILABLE", message: "The provider could not be reached." },
      }),
    ],
    [
      "the provider rate-limited the request",
      response({
        status: "unavailable",
        explanation: null,
        failure: { code: "RATE_LIMITED", message: "The provider rate-limited this request." },
      }),
    ],
    [
      "the provider timed out",
      response({
        status: "unavailable",
        explanation: null,
        failure: { code: "TIMEOUT", message: "The provider did not answer within the timeout." },
      }),
    ],
  ];

  for (const [label, failed] of cases) {
    it(`states the reason and no conclusion when ${label}`, () => {
      const html = markup(<AiExplanationResult response={failed} />);
      expect(html).toContain("No AI explanation is available");
      expect(html).toContain(escaped(failed.failure?.message ?? ""));
      // The deterministic side is intact and said so.
      expect(html).toContain("ABSTAINED");
      expect(html).toContain("are unchanged");
      // Nothing model-authored appears in place of the certificate.
      expect(html).not.toContain("materially indistinguishable");
      expect(html).not.toContain("Suggested next step");
      // And no credential leaks into the message the user reads.
      expect(html).not.toContain("sk-ant");
    });
  }

  it("renders no evidence-summary block when the server sent none", () => {
    // The API-unreachable branch: apps/api never answered, so there is no
    // fallback to render and the browser composes none of its own.
    const html = markup(<AiExplanationResult response={cases[1]?.[1] ?? response()} />);
    expect(html).not.toContain("Evidence summary");
    expect(html).not.toContain("Written by ASSAY");
  });

  it("offers a retry rather than a dead panel", () => {
    const html = markup(
      <AiExplanationResult
        response={cases[1]?.[1] ?? response()}
        onRetry={() => undefined}
      />,
    );
    expect(html).toContain("Try again");
  });
});

describe("when boundary 2 discards the answer, the discard is the message", () => {
  const rejected = markup(
    <AiExplanationResult
      response={response({
        status: "rejected",
        explanation: null,
        grounding: grounding({
          checks: { schema: "pass", allowlist: "pass", numerals: "fail" },
          rejected_numerals: ["99999999"],
        }),
        failure: {
          code: "UNGROUNDED_NUMERAL",
          message:
            "The model wrote a figure that does not appear in the verified evidence, so " +
            "ASSAY discarded the whole response. The certificate below is unchanged.",
        },
      })}
    />,
  );

  it("says the draft was discarded rather than showing it", () => {
    expect(rejected).toContain("The draft explanation was discarded");
    expect(rejected).toContain("does not appear in the verified evidence");
    expect(rejected).not.toContain("materially indistinguishable");
  });

  it("names the figure it refused to repeat, and the failing check", () => {
    expect(rejected).toContain("figures failed");
    expect(rejected).toContain("Discarded ungrounded figures: 99999999");
  });

  it("still shows the deterministic verdict", () => {
    expect(rejected).toContain("ABSTAINED");
    expect(rejected).toContain("are unchanged");
  });
});

describe("the panel reports the state ASSAY decided, never the model's", () => {
  it("shows ABSTAINED even when the prose claims the item reconciled", () => {
    const html = markup(
      <AiExplanationResult
        response={response({
          explanation: {
            summary: "ASSAY reconciled this settlement and no further work is needed.",
            why: ["It looks fine.", "Nothing else was found."],
            risk: "None.",
            next_step: "Close the period.",
          },
        })}
      />,
    );
    // The prose is the model's and is shown as the model's.
    expect(html).toContain("ASSAY reconciled this settlement");
    // The verdict is not, and it disagrees, visibly.
    expect(html).toContain("ABSTAINED");
    expect(html).toContain("badge-abstained");
    expect(html).not.toContain("badge-reconciled");
  });

  it("uses the state on the response and never a state of its own", () => {
    for (const state of ["ABSTAINED", "EXCEPTION", "RECONCILED"] as const) {
      const html = markup(
        <AiExplanationResult response={response({ grounding: grounding({ deterministic_state: state }) })} />,
      );
      expect(html).toContain(state);
    }
  });
});

describe("the panel is subordinate to the deterministic decision", () => {
  const ok = markup(<AiExplanationResult response={response()} />);

  it("uses no display-metric type — the hero figure belongs to the certificate", () => {
    expect(ok).not.toContain("font-display-metric");
  });

  it("is introduced as an explanation, not as a finding", () => {
    expect(ok).toContain("Explaining ASSAY&#x27;s decision");
    expect(ok).toContain("Grounded in ASSAY evidence");
  });
});

// ---------------------------------------------------------------------------
// 7b. The deterministic fallback, and what makes it not an AI explanation.
// ---------------------------------------------------------------------------

describe("the deterministic evidence summary", () => {
  const unavailable = response({
    status: "unavailable",
    explanation: null,
    provider: null,
    fallback: fallback(),
    grounding: grounding({
      checks: { schema: "not_reached", allowlist: "not_reached", numerals: "not_reached" },
      system_prompt_id: null,
      system_prompt_hash: "",
    }),
    failure: {
      code: "MISSING_CREDENTIAL",
      message:
        "No provider credential is configured on the server. Set GEMINI_API_KEY in the API " +
        "process environment to enable AI explanations. ASSAY's decision, certificate and " +
        "ledger are unaffected.",
    },
  });
  const html = markup(<AiExplanationResult response={unavailable} />);

  it("renders the server's label verbatim", () => {
    expect(html).toContain("Evidence summary — AI unavailable");
  });

  it("attributes it to ASSAY and denies that it is an AI explanation", () => {
    expect(html).toContain("Written by ASSAY from the verified evidence on this page");
    expect(html).toContain("Not an AI explanation");
  });

  it("still says the AI is unavailable and why", () => {
    // The summary supplements the failure notice; it does not replace it, so a
    // reader is never left thinking the AI answered.
    expect(html).toContain("No AI explanation is available");
    expect(html).toContain("GEMINI_API_KEY");
    expect(html).not.toContain("AIzaSy");
  });

  it("shows the evidence points the server composed", () => {
    for (const point of unavailable.fallback?.points ?? []) {
      expect(html).toContain(escaped(point));
    }
    expect(html).toContain(escaped(unavailable.fallback?.risk ?? ""));
  });

  it("keeps ASSAY's verdict as the panel's header, exactly as on the AI path", () => {
    expect(html).toContain("ABSTAINED");
    expect(html).toContain("decided deterministically");
    expect(html).toContain("are unchanged");
  });

  it("puts no model prose on screen and claims no model", () => {
    expect(html).not.toContain("materially indistinguishable");
    expect(html).not.toContain("Model ");
    expect(html).not.toContain("via gemini");
    expect(html).not.toContain("via anthropic");
  });
});
