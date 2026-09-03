import { describe, expect, it } from "vitest";

import {
  AMBIGUOUS_DECISION,
  CLOSE_REPORT,
  EXCEPTION_DECISION,
  EXCEPTION_QUEUE,
  LEDGER_VERIFY,
} from "./support/fixture-registry.js";
import {
  CloseReportOutputSchema,
  DecisionEvidenceOutputSchema,
  ExceptionQueueOutputSchema,
  LedgerVerifyOutputSchema,
} from "../src/tools.js";

/**
 * Every output schema parses the real captured `demo-500` shape — the
 * fixtures ARE what the four endpoints these tools bind to actually return,
 * reshaped, so a schema that rejects them would be a schema that rejects the
 * real API.
 */

describe("output schemas accept the real fixture shapes", () => {
  it("CloseReportOutputSchema", () => {
    expect(() => CloseReportOutputSchema.parse(CLOSE_REPORT)).not.toThrow();
  });
  it("ExceptionQueueOutputSchema, all 26 real rows", () => {
    expect(() => ExceptionQueueOutputSchema.parse(EXCEPTION_QUEUE)).not.toThrow();
  });
  it("DecisionEvidenceOutputSchema — the certificate-bearing decision", () => {
    expect(() => DecisionEvidenceOutputSchema.parse(AMBIGUOUS_DECISION)).not.toThrow();
  });
  it("DecisionEvidenceOutputSchema — the certificate-free exception", () => {
    expect(() => DecisionEvidenceOutputSchema.parse(EXCEPTION_DECISION)).not.toThrow();
  });
  it("LedgerVerifyOutputSchema", () => {
    expect(() => LedgerVerifyOutputSchema.parse(LEDGER_VERIFY)).not.toThrow();
  });
});

describe("strictObject refuses an amount the schema does not declare — R-1", () => {
  it("CloseReportOutputSchema rejects an extra field", () => {
    const poisoned = { ...CLOSE_REPORT, suggested_write_off_paise: 1 };
    expect(() => CloseReportOutputSchema.parse(poisoned)).toThrow();
  });
  it("DecisionEvidenceOutputSchema rejects an extra field on the certificate", () => {
    const poisoned = {
      ...AMBIGUOUS_DECISION,
      certificate: { ...AMBIGUOUS_DECISION.certificate, resolved_amount_paise: 1 },
    };
    expect(() => DecisionEvidenceOutputSchema.parse(poisoned)).toThrow();
  });
});

describe("required fields are actually required", () => {
  it("a queue item missing suspense_key fails to parse", () => {
    const withoutKey: Record<string, unknown> = { ...EXCEPTION_QUEUE.items[0]! };
    delete withoutKey["suspense_key"];
    expect(() => ExceptionQueueOutputSchema.parse({ ...EXCEPTION_QUEUE, items: [withoutKey] })).toThrow();
  });
});
