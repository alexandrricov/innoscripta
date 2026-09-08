/**
 * The four display units of the staffing grid (domain rule R2).
 *
 * One canonical unit is stored - hours - and the grid reads and edits in hours,
 * person-months, % of capacity or cost. Conversion happens only here, at the
 * edge with the UI.
 *
 * Converting and formatting are separate on purpose, and that separation is
 * what satisfies "switching units and switching back must not change the stored
 * value".
 *
 * `toUnit` returns the exact converted value. `formatUnit` rounds it for the
 * eye, and that rounding loses information: 88.4 hours is 50.2272...% of a
 * 40-hour March, shown as "50.2", and reading "50.2" back gives 88.352 hours.
 *
 * So switching units is a read-only operation. The stored value changes only
 * when the user commits an edit, and what gets parsed then is what they typed,
 * never what we displayed to them.
 */

import { allocationCost, hoursFromCost } from './allocation-cost.ts';
import type { YearMonth } from './calendar.ts';
import { personMonthHours } from './person-month.ts';
import type { RateSlice } from './rate-schedule.ts';

export const GRID_UNITS = ['hours', 'personMonths', 'percent', 'cost'] as const;

export type GridUnit = (typeof GRID_UNITS)[number];

/**
 * Everything needed to convert one cell: which month, whose contract, and the
 * rates covering that month.
 *
 * Hours need none of it. Person-months and % of capacity need the contract,
 * because a person-month is `weeklyHours * workingDays / 5`. Cost needs the
 * rates.
 */
export interface EmployeeMonth {
  readonly month: YearMonth;
  readonly weeklyHours: number;
  readonly rateSlices: readonly RateSlice[];
}

/** Fixed by the specification, not a preference. */
const DISPLAY_DECIMALS: Record<GridUnit, number> = {
  hours: 2,
  personMonths: 2,
  percent: 1,
  cost: 2,
};

/**
 * The stored hours expressed in `unit`, exactly and unrounded.
 *
 * Use this for arithmetic and for comparisons. Pass the result through
 * `formatUnit` only when it is about to be shown.
 */
export function toUnit(hours: number, unit: GridUnit, basis: EmployeeMonth): number {
  assertNonNegative(hours, 'hours');

  switch (unit) {
    case 'hours':
      return hours;
    case 'personMonths':
      return hours / personMonthHoursOf(basis);
    case 'percent':
      return (hours / personMonthHoursOf(basis)) * 100;
    case 'cost':
      return allocationCost(hours, basis.rateSlices, basis.month);
  }
}

/**
 * A value the user typed in `unit`, converted back to stored hours.
 *
 * Throws for a cost typed into a month with no priced working day, where the
 * conversion has no answer. Callers should not offer a cost edit there; see
 * `blendedHourlyRate`.
 */
export function fromUnit(value: number, unit: GridUnit, basis: EmployeeMonth): number {
  assertNonNegative(value, unit);

  switch (unit) {
    case 'hours':
      return value;
    case 'personMonths':
      return value * personMonthHoursOf(basis);
    case 'percent':
      return (value / 100) * personMonthHoursOf(basis);
    case 'cost':
      return hoursFromCost(value, basis.rateSlices, basis.month);
  }
}

/**
 * The display string for a value already expressed in `unit`.
 *
 * Lossy by design - it is the last step before the screen. Never feed its
 * output back into `fromUnit`.
 */
export function formatUnit(value: number, unit: GridUnit): string {
  return value.toFixed(DISPLAY_DECIMALS[unit]);
}

function personMonthHoursOf(basis: EmployeeMonth): number {
  return personMonthHours(basis.weeklyHours, basis.month);
}

function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Expected ${name} to be a non-negative number, got ${String(value)}`);
  }
}
