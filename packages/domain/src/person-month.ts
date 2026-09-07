/**
 * The size of a person-month (domain rule R2).
 *
 *     one person-month = weeklyHours * (working days that month / 5)
 *
 * It is not a constant. It varies by person, because contracts differ, and by
 * month, because months hold a different number of working days. A person on 40
 * hours has a 176 hour person-month in March 2026 and a 160 hour one in
 * February 2026.
 *
 * Every unit conversion in the grid goes through this number, so getting it
 * wrong quietly corrupts hours, percentages and cost at once.
 */

import type { YearMonth } from './calendar.ts';
import { workingDaysInMonth } from './working-days.ts';

/** Working days in a full-time week. Not the same thing as `weeklyHours`. */
const WORKING_DAYS_PER_WEEK = 5;

/** Hours in one person-month for this contract, in this month. */
export function personMonthHours(weeklyHours: number, month: YearMonth): number {
  assertWeeklyHours(weeklyHours);
  return (weeklyHours * workingDaysInMonth(month)) / WORKING_DAYS_PER_WEEK;
}

/**
 * Hours this person works on any single working day of the month.
 *
 * The effort is spread evenly, so this is the same for every working day - it
 * is what makes pricing a month by slices of working days correct.
 */
export function hoursPerWorkingDay(hours: number, month: YearMonth): number {
  const workingDays = workingDaysInMonth(month);
  // A month with no working days cannot happen in the Gregorian calendar, but
  // dividing by a count is worth guarding rather than returning Infinity.
  if (workingDays === 0) {
    throw new RangeError('A month with no working days cannot carry an allocation');
  }
  return hours / workingDays;
}

function assertWeeklyHours(weeklyHours: number): void {
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0) {
    throw new RangeError(`Weekly hours must be a positive number, got ${String(weeklyHours)}`);
  }
}
