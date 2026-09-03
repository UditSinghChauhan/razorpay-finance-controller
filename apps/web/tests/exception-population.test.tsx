import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { RunContext } from "../src/context/RunContext.js";
import { InvestigationQueue } from "../src/pages/InvestigationQueue.js";
import {
  SUSPENSE_ABSTAINED_LABEL,
  SUSPENSE_EXCEPTIONS_LABEL,
} from "../src/lib/copy.js";
import type { ExceptionsResponse } from "../src/hooks/useAssayApi.js";
import { EXCEPTIONS, runContext } from "./fixtures.js";

/**
 * The exception population and the suspense population are different, and the
 * queue header must not read as though they are the same.
 *
 * On the live demo run `GET /runs/:id/exceptions` answers with twenty open
 * `E13_LEDGER_ONLY` records — carrying 4_976_977 paise between them — beside a
 * `value_exceptions_paise` of zero, because DATA_MODEL.md §20 totals only the
 * unresolved items that reach the suspense account and none of those twenty is
 * keyed. Both figures are the API's and neither is adjusted here; what is
 * asserted below is that the labels say which population each one counts.
 */

/** The live shape: open exception records that post no suspense entry. */
const LEDGER_ONLY: ExceptionsResponse = {
  ...EXCEPTIONS,
  total: 26,
  value_abstained_paise: 10_000_000,
  // The gate's own figure on the demo run. Not a placeholder: zero is what the
  // suspense split totals when no open exception carries a `suspense_key`.
  value_exceptions_paise: 0,
  items: [
    ...EXCEPTIONS.items.filter((i) => i.state === "ABSTAINED"),
    ...Array.from({ length: 20 }, (_, n) => ({
      decision_id: `dec_ledgerentry${String(n)}`,
      obs_id: `obs_ledgerentry${String(n)}`,
      entity_id: `mle_DEMO${String(n).padStart(4, "0")}000000`,
      kind: "ledger_entry",
      state: "EXCEPTION" as const,
      value_paise: 200_000 + n,
      exception_class: "E13_LEDGER_ONLY",
      suspense_key: null,
      comp_id: null,
      evt_id: `evt_ledgerentry${String(n)}`,
      has_certificate: false,
    })),
  ],
};

function render(exceptions: ExceptionsResponse): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RunContext.Provider value={runContext({ exceptions })}>
        <InvestigationQueue />
      </RunContext.Provider>
    </MemoryRouter>,
  );
}

describe("Investigation Queue — the record count is not the suspense total", () => {
  const html = render(LEDGER_ONLY);

  it("counts the exception population as records, not as rupees", () => {
    expect(html).toContain("20 open exception records");
  });

  it("names both rupee totals as suspense-queue figures", () => {
    expect(html).toContain(SUSPENSE_ABSTAINED_LABEL);
    expect(html).toContain(SUSPENSE_EXCEPTIONS_LABEL);
  });

  it("no longer labels the gate figure as the exceptions' value", () => {
    // "Value Exceptions" over ₹0.00 is the reading this change exists to stop.
    expect(html).not.toContain(">Value Exceptions<");
    expect(html).not.toContain(">Value Abstained<");
  });

  it("says the zero is a scope, not a valuation of the twenty records", () => {
    expect(html).toContain("Open exception records that post no suspense entry are outside this figure");
    expect(html).toContain("it is not a statement of their value");
    expect(html).toContain("Each record&#x27;s own rupee value is ranked in the table below");
  });

  it("says which population the abstained total covers", () => {
    expect(html).toContain("It counts the keyed component target, not every abstained observation row");
  });

  it("still shows the API's own figures, unadjusted", () => {
    // The zero stays on screen: the label changed, the number did not.
    // `formatPaise` omits a zero paise part, so whole rupees render bare.
    expect(html).toContain(">₹0</p>");
    expect(html).toContain(">₹1,00,000</p>");
    expect(LEDGER_ONLY.value_exceptions_paise).toBe(0);
    expect(LEDGER_ONLY.value_abstained_paise).toBe(10_000_000);
  });

  it("still ranks every record by its own value, none of them shown as zero", () => {
    for (const item of LEDGER_ONLY.items.filter((i) => i.state === "EXCEPTION")) {
      expect(item.value_paise).toBeGreaterThan(0);
      expect(html).toContain(item.entity_id);
    }
  });
});
