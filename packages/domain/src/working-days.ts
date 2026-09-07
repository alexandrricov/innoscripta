/**
 * Working-day arithmetic (domain rule R1).
 *
 * An allocation spreads evenly across the working days of its month, so every
 * working day carries the same effort. Everything downstream is built on these
 * counts: the size of a person-month, the split of a month across rate changes,
 * and the blended rate used when a cell is edited in currency.
 *
 * Working days are Monday to Friday. Public holidays are ignored entirely.
 */

import { type CalendarDay, daysInMonth, isWorkingDay, type YearMonth } from './calendar.ts';

/** Working days in the whole month. */
export function workingDaysInMonth(month: YearMonth): number {
  return countWorkingDays(month, 1, daysInMonth(month));
}

/**
 * Working days strictly before `boundary` within its month.
 *
 * This is the old-rate side of a mid-month rate change: `validFrom` is
 * inclusive, so the boundary day itself belongs to the new rate and is
 * excluded here.
 */
export function workingDaysBefore(boundary: CalendarDay): number {
  return countWorkingDays(boundary, 1, boundary.day - 1);
}

/**
 * Working days from `boundary` to the end of its month, `boundary` included.
 * This is the new-rate side of a mid-month rate change.
 */
export function workingDaysFrom(boundary: CalendarDay): number {
  return countWorkingDays(boundary, boundary.day, daysInMonth(boundary));
}

/**
 * Working days in `[fromDay, toDay]`, both inclusive, within a single month.
 *
 * The range is clamped to the month rather than validated, and an inverted
 * range counts zero. That keeps the rate-slicing arithmetic free of edge cases
 * for changes landing on the first or the last day of a month.
 */
export function countWorkingDays(month: YearMonth, fromDay: number, toDay: number): number {
  const first = Math.max(1, fromDay);
  const last = Math.min(daysInMonth(month), toDay);

  let count = 0;
  for (let day = first; day <= last; day += 1) {
    if (isWorkingDay({ year: month.year, month: month.month, day })) {
      count += 1;
    }
  }
  return count;
}
