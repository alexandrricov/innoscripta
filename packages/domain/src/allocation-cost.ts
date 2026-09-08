/**
 * Pricing one allocation for one month (domain rules R1 and R2).
 *
 * The canonical unit is hours, so an allocation arrives here as a number of
 * hours. The month is already split into runs of working days sharing a rate;
 * this module turns that into money, and money back into hours when a cell is
 * edited in currency.
 */

import type { YearMonth } from './calendar.ts';
import { hoursPerWorkingDay } from './person-month.ts';
import type { RateSlice } from './rate-schedule.ts';
import { workingDaysInMonth } from './working-days.ts';

/**
 * What this allocation costs in the month, in currency.
 *
 * The allocation is spread evenly, so every working day carries the same hours;
 * a run of days at one rate therefore costs `days * hoursPerDay * rate`.
 * Unpriced runs cost nothing - the employee has no rate record covering them.
 */
export function allocationCost(
  hours: number,
  slices: readonly RateSlice[],
  month: YearMonth,
): number {
  assertNonNegative(hours, 'hours');
  return rateWeight(slices, month) * hoursPerWorkingDay(hours, month);
}

/**
 * The average price of one hour of this employee's time in this month, weighted
 * by how many working days sit at each rate.
 *
 * Not the arithmetic mean of the rates: with 8 working days at 80 and 14 at 95,
 * this is 89.5455 and not 87.50, because the later rate covers more days.
 *
 * Deliberately independent of the allocation - it takes no hours. Both cost and
 * hours scale together, so their ratio does not depend on the size of the
 * allocation. That is what makes editing a cell in currency possible: without
 * it, deriving hours from an amount would need the hours it is deriving.
 *
 * Returns zero when nothing in the month is priced. Callers must not offer a
 * currency edit in that case, because `hoursFromCost` cannot invert it.
 */
export function blendedHourlyRate(slices: readonly RateSlice[], month: YearMonth): number {
  return rateWeight(slices, month) / workingDaysInMonth(month);
}

/**
 * The hours an amount of currency buys in this month - the inverse of
 * `allocationCost`, used when a cell is edited in currency.
 *
 * Throws when the month carries no priced day, since dividing by a blended rate
 * of zero has no answer. Check `blendedHourlyRate(...) > 0` before offering the
 * edit.
 */
export function hoursFromCost(
  cost: number,
  slices: readonly RateSlice[],
  month: YearMonth,
): number {
  assertNonNegative(cost, 'cost');

  const blended = blendedHourlyRate(slices, month);
  if (blended === 0) {
    throw new RangeError(
      'This month has no priced working day, so a cost cannot be converted into hours',
    );
  }
  return cost / blended;
}

/**
 * What the month would cost if the employee worked exactly one hour on each of
 * its working days.
 *
 * Summing `days * rate` first keeps the arithmetic on whole numbers for as long
 * as possible - the reference month is 1970 * 4, exactly 7880 - and costs one
 * multiplication per month instead of one per slice, so there are fewer places
 * to round. Measured, the two orders agree exactly whenever the hours divide
 * the working days evenly and differ by about 1e-13 when they do not, which
 * stays far inside the 0.01 tolerance even summed across the whole grid. This
 * is hygiene rather than a correctness requirement.
 */
function rateWeight(slices: readonly RateSlice[], month: YearMonth): number {
  let weight = 0;
  let accountedDays = 0;

  for (const slice of slices) {
    accountedDays += slice.workingDays;
    if (slice.kind === 'priced') {
      weight += slice.workingDays * slice.hourlyCost;
    }
  }

  // The slices have to account for the whole month, or the blended rate is
  // computed against the wrong denominator and every number here is quietly
  // wrong. `splitMonthByRates` guarantees this; the check catches a caller that
  // assembled slices by hand.
  const expected = workingDaysInMonth(month);
  if (accountedDays !== expected) {
    throw new RangeError(
      `Slices cover ${String(accountedDays)} working days but the month has ${String(expected)}`,
    );
  }

  return weight;
}

function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Expected ${name} to be a non-negative number, got ${String(value)}`);
  }
}
