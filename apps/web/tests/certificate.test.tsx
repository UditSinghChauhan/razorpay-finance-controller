import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SolutionCard } from "../src/pages/AmbiguityCertificate.js";
import { probeSummary } from "../src/lib/copy.js";
import { ALLOCATION, SOLUTION_A, SOLUTION_B, CANDIDATE_A_ID, CANDIDATE_B_ID } from "./fixtures.js";

/**
 * The Ambiguity Certificate's hypothesis cards — F1/F2 (member ids), F3
 * (candidate id), A3 (member amounts) and A1 (probe copy).
 *
 * Rendered through `renderToStaticMarkup`, so what is asserted is the markup the
 * component actually produces rather than the props it was handed.
 */

const RUPEE = "₹";

function markup(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

function cardA(): string {
  return markup(
    <SolutionCard
      label="Solution A"
      solution={{ ...SOLUTION_A, member_obs_ids: [...SOLUTION_A.member_obs_ids] }}
      allocation={ALLOCATION.solution_a}
      targetPaise={ALLOCATION.target?.value_paise ?? null}
      color="#000"
    />,
  );
}

function cardB(): string {
  return markup(
    <SolutionCard
      label="Solution B"
      solution={{ ...SOLUTION_B, member_obs_ids: [...SOLUTION_B.member_obs_ids] }}
      allocation={ALLOCATION.solution_b}
      targetPaise={ALLOCATION.target?.value_paise ?? null}
      color="#000"
    />,
  );
}

describe("member ids come from member_obs_ids", () => {
  it("renders every member the certificate names", () => {
    const a = cardA();
    expect(a).toContain("obs_reconline00001");
    expect(a).toContain("obs_reconline00002");
    expect(a).toContain("obs_reconline00003");

    const b = cardB();
    expect(b).toContain("obs_reconline00004");
    expect(b).toContain("obs_reconline00005");
  });

  it("renders no member of the other solution", () => {
    expect(cardA()).not.toContain("obs_reconline00004");
    expect(cardB()).not.toContain("obs_reconline00001");
  });

  it("renders the members even when the read model has no amounts for them", () => {
    // The ids are the sealed certificate's; they must not depend on the
    // enrichment being present.
    const bare = markup(
      <SolutionCard
        label="Solution A"
        solution={{ ...SOLUTION_A, member_obs_ids: [...SOLUTION_A.member_obs_ids] }}
        allocation={null}
        targetPaise={null}
        color="#000"
      />,
    );
    expect(bare).toContain("obs_reconline00001");
    expect(bare).toContain("Member amounts are not available");
    // No total is claimed where the rows carry no amounts.
    expect(bare).not.toContain("Reconciles to target");
  });
});

describe("candidate_id is rendered, subordinate to the content", () => {
  it("shows each solution's own candidate id", () => {
    expect(cardA()).toContain(CANDIDATE_A_ID);
    expect(cardB()).toContain(CANDIDATE_B_ID);
    expect(cardA()).not.toContain(CANDIDATE_B_ID);
  });

  it("labels it and gives it the technical-identifier treatment", () => {
    const a = cardA();
    expect(a).toContain("Candidate ID");
    // `cell-id` is the design system's mono identifier style, and `text-muted`
    // is what keeps it visually subordinate to the amounts beside it.
    expect(a).toMatch(/class="cell-id text-muted"[^>]*>\s*cand_/);
  });
});

describe("member amounts are the run's real allocation values", () => {
  it("renders each member's C6 allocation term", () => {
    const a = cardA();
    expect(a).toContain(`${RUPEE}50,000`);
    expect(a).toContain(`${RUPEE}30,000`);
    expect(a).toContain(`${RUPEE}20,000`);

    const b = cardB();
    expect(b).toContain(`${RUPEE}60,000`);
    expect(b).toContain(`${RUPEE}40,000`);
  });

  it("totals both solutions to the target, visibly", () => {
    for (const card of [cardA(), cardB()]) {
      expect(card).toContain("Total allocated");
      expect(card).toContain(`${RUPEE}1,00,000`);
      expect(card).toContain("Target");
      expect(card).toContain("Reconciles to target");
    }
  });

  it("shows §14.1's gross value beside the allocation, not instead of it", () => {
    // obs_reconline00001 allocates ₹50,000 out of a ₹51,180 gross line. The
    // queue ranks by the gross figure, so both must be legible and distinct.
    const a = cardA();
    expect(a).toContain(`${RUPEE}50,000`);
    expect(a).toContain(`gross ${RUPEE}51,180`);
  });
});

describe("probe copy reflects what actually happened", () => {
  it("does not claim a probe failed when none was required", () => {
    const note = probeSummary(0, "EVIDENCE_TIE");
    expect(note).toBe("0 probes required — the evidence scores were already tied.");
    expect(note).not.toContain("No probe produced admissible evidence");
  });

  it("invents no explanation for a zero-probe certificate of another reason", () => {
    expect(probeSummary(0, "SEARCH_BOUND_EXCEEDED")).toBe("0 probes were run.");
  });

  it("says probes failed to discriminate only when probes were run", () => {
    expect(probeSummary(2, "EVIDENCE_TIE")).toBe(
      "2 probes attempted; none produced admissible evidence that discriminates the hypotheses.",
    );
    expect(probeSummary(1, "PROBE_BUDGET_EXHAUSTED")).toContain("1 probe attempted");
  });
});
