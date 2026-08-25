import { describe, expect, it } from "vitest";

import {
  ACCOUNT_CODES,
  SUSPENSE_ACCOUNT,
  isAccountCode,
  type AccountCode,
} from "@assay/domain";

describe("control accounts", () => {
  it("declares exactly the seven accounts of DATA_MODEL.md §17", () => {
    expect(ACCOUNT_CODES).toEqual([
      "1100_GATEWAY_RECEIVABLE",
      "1200_BANK",
      "1300_GST_INPUT_CREDIT",
      "2200_REFUND_LIABILITY",
      "4000_REVENUE",
      "5100_PG_FEE_EXPENSE",
      "9000_SUSPENSE_UNRECONCILED",
    ]);
    // §17.2: "No eighth AccountCode is added." EVALUATION_SPEC.md §4.4 sums
    // balance_harm over exactly this universe, so the count is load-bearing.
    expect(ACCOUNT_CODES).toHaveLength(7);
  });

  it("names Suspense as one of the seven", () => {
    expect(SUSPENSE_ACCOUNT).toBe("9000_SUSPENSE_UNRECONCILED");
    expect(ACCOUNT_CODES).toContain(SUSPENSE_ACCOUNT);
  });

  it("is frozen, so a consumer cannot append an eighth account", () => {
    expect(Object.isFrozen(ACCOUNT_CODES)).toBe(true);
    expect(() => {
      (ACCOUNT_CODES as unknown as string[]).push("9999_INVENTED");
    }).toThrow(TypeError);
    expect(ACCOUNT_CODES).toHaveLength(7);
  });

  it("recognises every declared account and nothing else", () => {
    for (const code of ACCOUNT_CODES) expect(isAccountCode(code)).toBe(true);
    for (const bad of ["", "1200_bank", "1200", "9999_INVENTED", "SUSPENSE"]) {
      expect(isAccountCode(bad)).toBe(false);
    }
  });

  it("has no duplicate codes", () => {
    expect(new Set<AccountCode>(ACCOUNT_CODES).size).toBe(ACCOUNT_CODES.length);
  });
});
