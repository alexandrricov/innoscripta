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

/**
 * Everything a conversion needs to know about one person's month: two numbers.
 *
 * Not the rate history, and not the contracted hours either. Conversion never
 * needed either of those - it multiplies and divides by these two derived
 * figures, and asking for more than it uses would oblige every caller to hold
 * data it has no business holding. It is also exactly what the rate owner
 * publishes across the app boundary.
 */
export interface MonthBasis {
  /** `weeklyHours * workingDays / 5`, so it varies by person and by month. */
  readonly personMonthHours: number;
  /**
   * The average price of an hour that month, weighted by working days at each
   * rate. Zero when the month carries no priced working day.
   */
  readonly blendedHourlyRate: number;
}

export const GRID_UNITS = ['hours', 'personMonths', 'percent', 'cost'] as const;

export type GridUnit = (typeof GRID_UNITS)[number];

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
export function toUnit(hours: number, unit: GridUnit, basis: MonthBasis): number {
  assertNonNegative(hours, 'hours');
  assertBasis(basis);

  switch (unit) {
    case 'hours':
      return hours;
    case 'personMonths':
      return hours / basis.personMonthHours;
    case 'percent':
      return (hours / basis.personMonthHours) * 100;
    case 'cost':
      return hours * basis.blendedHourlyRate;
  }
}

/**
 * A value the user typed in `unit`, converted back to stored hours.
 *
 * Throws for a cost typed into a month with no priced working day, where the
 * conversion has no answer. Callers must not offer a cost edit there; the
 * blended rate being zero is how they can tell.
 */
export function fromUnit(value: number, unit: GridUnit, basis: MonthBasis): number {
  assertNonNegative(value, unit);
  assertBasis(basis);

  switch (unit) {
    case 'hours':
      return value;
    case 'personMonths':
      return value * basis.personMonthHours;
    case 'percent':
      return (value / 100) * basis.personMonthHours;
    case 'cost':
      if (basis.blendedHourlyRate === 0) {
        throw new RangeError(
          'This month has no priced working day, so a cost cannot be converted into hours',
        );
      }
      return value / basis.blendedHourlyRate;
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

/** How many decimals `unit` is displayed with, for rounding a set of cells. */
export function displayDecimals(unit: GridUnit): number {
  return DISPLAY_DECIMALS[unit];
}

function assertBasis(basis: MonthBasis): void {
  if (!Number.isFinite(basis.personMonthHours) || basis.personMonthHours <= 0) {
    throw new RangeError(
      `A person-month must be a positive number of hours, got ${String(basis.personMonthHours)}`,
    );
  }
  if (!Number.isFinite(basis.blendedHourlyRate) || basis.blendedHourlyRate < 0) {
    throw new RangeError(
      `A blended rate must be a non-negative number, got ${String(basis.blendedHourlyRate)}`,
    );
  }
}

function assertNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Expected ${name} to be a non-negative number, got ${String(value)}`);
  }
}
