/**
 * Calendar primitives.
 *
 * All arithmetic runs in UTC on purpose. A working-day count must not change
 * with the machine's timezone or with daylight saving, and the domain never
 * needs a wall-clock instant - only whole calendar days.
 */

/** A calendar month. `month` is 1-12, not the zero-based value `Date` uses. */
export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** A whole calendar day. `month` is 1-12. */
export interface CalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;
const CALENDAR_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function yearMonth(year: number, month: number): YearMonth {
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new RangeError(`Year and month must be integers, got ${String(year)}-${String(month)}`);
  }
  if (month < 1 || month > 12) {
    throw new RangeError(`Month must be 1-12, got ${String(month)}`);
  }
  return { year, month };
}

export function calendarDay(year: number, month: number, day: number): CalendarDay {
  const checked = yearMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(checked)) {
    throw new RangeError(`Day must be within ${formatYearMonth(checked)}, got ${String(day)}`);
  }
  return { year: checked.year, month: checked.month, day };
}

/** Parses `YYYY-MM`, the shape the seed fixtures use for `Allocation.month`. */
export function parseYearMonth(value: string): YearMonth {
  if (!YEAR_MONTH_PATTERN.test(value)) {
    throw new RangeError(`Expected a YYYY-MM month, got "${value}"`);
  }
  return yearMonth(Number(value.slice(0, 4)), Number(value.slice(5, 7)));
}

/** Parses `YYYY-MM-DD`, the shape the seed fixtures use for `RateRecord.validFrom`. */
export function parseCalendarDay(value: string): CalendarDay {
  if (!CALENDAR_DAY_PATTERN.test(value)) {
    throw new RangeError(`Expected a YYYY-MM-DD date, got "${value}"`);
  }
  return calendarDay(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)),
    Number(value.slice(8, 10)),
  );
}

export function formatYearMonth(month: YearMonth): string {
  return `${pad(month.year, 4)}-${pad(month.month, 2)}`;
}

export function formatCalendarDay(day: CalendarDay): string {
  return `${formatYearMonth(day)}-${pad(day.day, 2)}`;
}

export function monthOf(day: CalendarDay): YearMonth {
  return { year: day.year, month: day.month };
}

export function sameMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/**
 * Orders two months: negative when `a` is earlier, positive when later, zero
 * when equal - the comparator contract `Array.prototype.sort` expects.
 */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year === b.year ? a.month - b.month : a.year - b.year;
}

export function compareCalendarDay(a: CalendarDay, b: CalendarDay): number {
  const byMonth = compareYearMonth(a, b);
  return byMonth === 0 ? a.day - b.day : byMonth;
}

/** Total days in the month, leap years included. */
export function daysInMonth(month: YearMonth): number {
  // `Date.UTC` takes a zero-based month, so passing 1-12 names the month after
  // this one; day 0 of that month is the last day of this one.
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}

/** True for Monday to Friday. Public holidays are ignored, by domain rule R1. */
export function isWorkingDay(day: CalendarDay): boolean {
  const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
