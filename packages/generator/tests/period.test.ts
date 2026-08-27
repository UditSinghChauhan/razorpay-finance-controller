import { describe, expect, it } from "vitest";

import {
  DAY_COUNT, DAY_EVENT_WINDOW_SECONDS, F03_RATE_CHANGE_AT, PERIOD_FROM, PERIOD_TO,
  SECONDS_PER_DAY, SETTLEMENT_TIME_OF_DAY, dayInstant, dayOf, dayStart, inPeriod,
  istYearMonth, settlementInstant,
} from "../src/period.js";
import { PERIOD, SETTLEMENT_WINDOW_DAYS } from "../src/frozen.js";

/** IST = UTC+05:30, so the IST wall clock is the UTC instant shifted by 19,800 s. */
const ist = (instant: number): string => new Date((instant + 19_800) * 1000).toISOString();

describe("§4.2 the simulated period", () => {
  it("spans 2026-07-01 00:00:00 IST to 2026-07-31 23:59:59 IST", () => {
    expect(ist(PERIOD_FROM)).toBe("2026-07-01T00:00:00.000Z");
    expect(ist(PERIOD_TO)).toBe("2026-07-31T23:59:59.000Z");
  });

  it("counts 2,678,400 seconds because both endpoints are inclusive", () => {
    expect(PERIOD_TO - PERIOD_FROM).toBe(PERIOD.duration_seconds - 1);
    expect(PERIOD_TO - PERIOD_FROM + 1).toBe(PERIOD.duration_seconds);
    expect(PERIOD.duration_seconds).toBe(DAY_COUNT * SECONDS_PER_DAY);
  });

  it("treats both endpoints as members", () => {
    expect(inPeriod(PERIOD_FROM)).toBe(true);
    expect(inPeriod(PERIOD_TO)).toBe(true);
    expect(inPeriod(PERIOD_FROM - 1)).toBe(false);
    expect(inPeriod(PERIOD_TO + 1)).toBe(false);
  });

  it("puts the F03 rate change at from + round_half_up(0.6 x duration)", () => {
    expect(F03_RATE_CHANGE_AT).toBe(1_784_451_240);
    expect(ist(F03_RATE_CHANGE_AT)).toBe("2026-07-19T14:24:00.000Z");
    expect(inPeriod(F03_RATE_CHANGE_AT)).toBe(true);
  });

  it("tiles the period into 31 whole days with no gap and no overlap", () => {
    expect(dayStart(1)).toBe(PERIOD_FROM);
    expect(dayStart(DAY_COUNT) + SECONDS_PER_DAY - 1).toBe(PERIOD_TO);
    for (let day = 1; day <= DAY_COUNT; day += 1) {
      expect(dayOf(dayStart(day))).toBe(day);
      expect(dayOf(dayStart(day) + SECONDS_PER_DAY - 1)).toBe(day);
    }
  });

  it("rejects a day outside 1..31 and an offset outside the event window", () => {
    expect(() => dayStart(0)).toThrow(RangeError);
    expect(() => dayStart(32)).toThrow(RangeError);
    expect(() => dayInstant(1, DAY_EVENT_WINDOW_SECONDS)).toThrow(RangeError);
    expect(() => dayOf(PERIOD_TO + 1)).toThrow(RangeError);
  });

  it("reads the receipt's period stamp as 2026 / 07", () => {
    expect(istYearMonth(PERIOD_FROM)).toStrictEqual({ year: "2026", month: "07" });
    expect(istYearMonth(PERIOD_TO)).toStrictEqual({ year: "2026", month: "07" });
  });
});

/**
 * The grid exists so that every true allocation satisfies `C3` and `C4` on the
 * seconds reading as well as the calendar-date one — a true allocation failing a
 * hard constraint fails the oracle completeness gate, which invalidates the
 * benchmark (`§5.3`).
 */
describe("the clock grid keeps C3 and C4 satisfiable", () => {
  it("leaves every capture strictly before its own day's settlement stamp", () => {
    const latestCapture = dayInstant(1, DAY_EVENT_WINDOW_SECONDS - 1);
    expect(latestCapture).toBeLessThan(settlementInstant(1));
  });

  it("keeps settled_at - created_at inside C4's [1, 7] calendar days for T+1..T+3", () => {
    for (const cycle of [1, 2, 3]) {
      for (const offset of [0, DAY_EVENT_WINDOW_SECONDS - 1]) {
        const created = dayInstant(1, offset);
        const gap = settlementInstant(1 + cycle) - created;
        expect(gap).toBeGreaterThanOrEqual(SETTLEMENT_WINDOW_DAYS.t_min * SECONDS_PER_DAY);
        expect(gap).toBeLessThanOrEqual(SETTLEMENT_WINDOW_DAYS.t_max * SECONDS_PER_DAY);
      }
    }
  });

  it("leaves three hours between the settlement stamp and midnight for the bank clock", () => {
    expect(SECONDS_PER_DAY - SETTLEMENT_TIME_OF_DAY).toBe(3 * 60 * 60);
  });

  it("puts a T+3 settlement of the final three capture days past period.to", () => {
    for (const day of [29, 30, 31]) {
      expect(settlementInstant(day + 3)).toBeGreaterThan(PERIOD_TO);
    }
    // ... and a T+2 settlement of day 29 still inside it, so the window is minimal.
    expect(settlementInstant(29 + 2)).toBeLessThan(PERIOD_TO);
  });
});
