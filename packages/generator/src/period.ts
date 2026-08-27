/**
 * The simulated period, its day grid, and the clocks each entity keeps.
 *
 * `PREREGISTRATION.md §4.2` fixes the period as one calendar month in IST with
 * **both endpoints inclusive**, compared as integer UTC epoch seconds
 * (`DATA_MODEL.md §0` rule 2). Every timestamp this generator emits is derived
 * here, so that "which day is this on" has one answer.
 *
 * **Why the time-of-day grid exists.** `§4.2` fixes each entity's *day* — the
 * capture window, the `T+n` cycle, the merchant clock — and states no time of
 * day. Left free, the obvious choice (draw uniformly over the whole day)
 * **breaks constraint `C4`**: a capture at 23:59 on day `d` settling at 00:01 on
 * day `d+1` is 120 seconds apart, and `C4` requires
 * `settled_at - created_at ∈ [1, 7]` days. A true allocation that fails a hard
 * constraint fails the oracle **completeness gate**, at which point
 * "the benchmark is invalid and no results may be reported from it"
 * (`§5.3`). The grid below is the smallest arrangement under which every true
 * allocation satisfies `C3` and `C4` on the seconds reading as well as the
 * calendar-date reading. Registered as `conventions.ts` `U-CLOCKS`.
 */

import { roundHalfUp } from "@assay/money";

import { F03_RATE_CHANGE_FRACTION, PERIOD } from "./frozen.js";

/** Seconds in one calendar day. No leap seconds: `§0` rule 2 counts epoch seconds. */
export const SECONDS_PER_DAY = 86_400;

/**
 * `21:00:00 IST` — the instant every settlement batch is stamped at.
 *
 * Chosen as late as the capture window allows: it must be strictly after every
 * capture on the previous day (`C4`'s `T_min`) and leave three hours before
 * midnight for the bank clock (`§4.2`: "value_date = the calendar date of
 * `settled_at` plus up to three hours"), so the credit stays on the settlement's
 * own calendar date.
 */
export const SETTLEMENT_TIME_OF_DAY = 21 * 60 * 60;

/** Captures, refunds and bookings are drawn from `[00:00:00, 21:00:00)` IST. */
export const DAY_EVENT_WINDOW_SECONDS = SETTLEMENT_TIME_OF_DAY;

/** `§4.2`: `[from, to]`, both endpoints inclusive. */
export const PERIOD_FROM = PERIOD.from;
export const PERIOD_TO = PERIOD.to;

/** Capture days, numbered `1..31`. Day 1 begins at `period.from`. */
export const DAY_COUNT = PERIOD.days;

/** `§4.2`: `from + round_half_up(0.6 * duration)`. Card lines at or after this take 195 bps. */
export const F03_RATE_CHANGE_AT =
  PERIOD_FROM + roundHalfUp(F03_RATE_CHANGE_FRACTION.num * PERIOD.duration_seconds, F03_RATE_CHANGE_FRACTION.den);

/** The first instant of capture day `day` (`1..31`), IST midnight as epoch seconds. */
export function dayStart(day: number): number {
  requireDay(day);
  return PERIOD_FROM + (day - 1) * SECONDS_PER_DAY;
}

/** The instant the settlement batch for capture day `day` is stamped, `day` may exceed 31. */
export function settlementInstant(day: number): number {
  if (!Number.isSafeInteger(day) || day < 1) {
    throw new RangeError(`settlementInstant: day must be a positive integer, received ${String(day)}`);
  }
  return PERIOD_FROM + (day - 1) * SECONDS_PER_DAY + SETTLEMENT_TIME_OF_DAY;
}

/** An instant `offset` seconds into capture day `day`, where `offset < 21:00:00`. */
export function dayInstant(day: number, offset: number): number {
  requireDay(day);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= DAY_EVENT_WINDOW_SECONDS) {
    throw new RangeError(
      `dayInstant: offset must lie in [0, ${String(DAY_EVENT_WINDOW_SECONDS)}), received ${String(offset)}`,
    );
  }
  return dayStart(day) + offset;
}

/** Whether `instant` lies in `[period.from, period.to]`, both inclusive (`§4.2`). */
export function inPeriod(instant: number): boolean {
  return instant >= PERIOD_FROM && instant <= PERIOD_TO;
}

/** The capture day an in-period instant belongs to, `1..31`. */
export function dayOf(instant: number): number {
  if (!inPeriod(instant)) {
    throw new RangeError(`dayOf: ${String(instant)} is outside [${String(PERIOD_FROM)}, ${String(PERIOD_TO)}]`);
  }
  return Math.floor((instant - PERIOD_FROM) / SECONDS_PER_DAY) + 1;
}

/** `YYYY-MM-DD` in IST for an instant. Used only inside quarantined free text. */
export function istDateString(instant: number): string {
  const shifted = new Date((instant + PERIOD.ist_offset_seconds) * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${String(y)}-${m}-${d}`;
}

/** `{ year: "YYYY", month: "MM" }` in IST — the receipt's period stamp (`§4.2`). */
export function istYearMonth(instant: number): { year: string; month: string } {
  const shifted = new Date((instant + PERIOD.ist_offset_seconds) * 1000);
  return {
    year: String(shifted.getUTCFullYear()).padStart(4, "0"),
    month: String(shifted.getUTCMonth() + 1).padStart(2, "0"),
  };
}

function requireDay(day: number): void {
  if (!Number.isSafeInteger(day) || day < 1 || day > DAY_COUNT) {
    throw new RangeError(`period: day must lie in [1, ${String(DAY_COUNT)}], received ${String(day)}`);
  }
}

// ---------------------------------------------------------------------------
// Load-time checks against §4.2's published numbers
// ---------------------------------------------------------------------------

if (PERIOD_TO - PERIOD_FROM + 1 !== PERIOD.duration_seconds) {
  throw new Error(
    `period: §4.2 publishes duration ${String(PERIOD.duration_seconds)} s, but the closed ` +
      `interval [from, to] spans ${String(PERIOD_TO - PERIOD_FROM + 1)} s.`,
  );
}
if (PERIOD.duration_seconds !== DAY_COUNT * SECONDS_PER_DAY) {
  throw new Error("period: §4.2's duration is not a whole number of 31 calendar days.");
}
if (F03_RATE_CHANGE_AT !== 1_784_451_240) {
  throw new Error(
    `period: the F03 rate instant derives to ${String(F03_RATE_CHANGE_AT)} but §4.2 publishes 1784451240.`,
  );
}
