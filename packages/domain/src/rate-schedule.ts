/**
 * Splitting a month across rate changes (domain rule R1).
 *
 * A rate applies from its `validFrom` until the next one begins; the last one
 * has no end. `validFrom` is inclusive, so the day itself is already priced at
 * the new rate. A month containing a change is therefore priced in two parts,
 * and a month containing several changes in as many parts.
 *
 * This module answers only "how many working days at which rate". It knows
 * nothing about hours, amounts or money - that keeps the calendar reasoning and
 * the arithmetic of cost separately testable.
 */

import {
  type CalendarDay,
  compareCalendarDay,
  daysInMonth,
  monthOf,
  sameMonth,
  type YearMonth,
} from './calendar.ts';
import { countWorkingDays } from './working-days.ts';

/** One entry of an employee's cost-rate history. */
export interface RateRecord {
  readonly validFrom: CalendarDay;
  readonly hourlyCost: number;
}

/**
 * A run of working days inside one month that share a single rate.
 *
 * A discriminated union rather than `hourlyCost: number | null` on purpose. An
 * allocation in a month earlier than the employee's first rate record has
 * working days but no rate, and that is not the same thing as a rate of zero.
 * With `null` the difference survives only as long as nobody multiplies by it;
 * here `unpriced` has no `hourlyCost` to multiply, so the compiler forces both
 * cases to be handled.
 */
export type RateSlice =
  | { readonly kind: 'priced'; readonly workingDays: number; readonly hourlyCost: number }
  | { readonly kind: 'unpriced'; readonly workingDays: number };

/**
 * Splits `month` into the runs of working days that share a rate.
 *
 * `rates` must be the history of a single employee; filtering by employee
 * happens at the data layer. Order does not matter, the history is sorted here.
 *
 * The working days of the returned slices always add up to the working days of
 * the month, which is the invariant the cost of a month rests on. Slices that
 * would carry no working day at all are dropped rather than returned empty: a
 * change taking effect on a Monday leaves the weekend before it with nothing to
 * price.
 */
export function splitMonthByRates(rates: readonly RateRecord[], month: YearMonth): RateSlice[] {
  const history = [...rates].sort((a, b) => compareCalendarDay(a.validFrom, b.validFrom));
  for (const record of history) {
    assertHourlyCost(record.hourlyCost);
  }

  const firstDayOfMonth: CalendarDay = { ...month, day: 1 };

  // The rate already running when the month opens. A record starting exactly on
  // the 1st is not this one - it belongs to the changes below, which keeps the
  // "validFrom is inclusive" rule in a single place.
  const openingRate = history
    .filter((record) => compareCalendarDay(record.validFrom, firstDayOfMonth) < 0)
    .at(-1);

  const changesThisMonth = history.filter((record) => sameMonth(monthOf(record.validFrom), month));

  const slices: RateSlice[] = [];
  let currentRate: number | undefined = openingRate?.hourlyCost;
  let sliceStartDay = 1;

  for (const change of changesThisMonth) {
    // The change day itself belongs to the new rate, so the run ending here
    // stops one day earlier.
    pushSlice(slices, month, sliceStartDay, change.validFrom.day - 1, currentRate);
    currentRate = change.hourlyCost;
    sliceStartDay = change.validFrom.day;
  }

  pushSlice(slices, month, sliceStartDay, daysInMonth(month), currentRate);

  return slices;
}

function pushSlice(
  slices: RateSlice[],
  month: YearMonth,
  fromDay: number,
  toDay: number,
  hourlyCost: number | undefined,
): void {
  const workingDays = countWorkingDays(month, fromDay, toDay);
  if (workingDays === 0) {
    return;
  }

  slices.push(
    hourlyCost === undefined
      ? { kind: 'unpriced', workingDays }
      : { kind: 'priced', workingDays, hourlyCost },
  );
}

function assertHourlyCost(hourlyCost: number): void {
  if (!Number.isFinite(hourlyCost) || hourlyCost < 0) {
    throw new RangeError(`An hourly cost must be a non-negative number, got ${String(hourlyCost)}`);
  }
}
