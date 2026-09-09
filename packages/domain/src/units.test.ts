import { describe, expect, it } from 'vitest';

import { allocationCost, blendedHourlyRate } from './allocation-cost.ts';
import { parseCalendarDay, yearMonth } from './calendar.ts';
import { personMonthHours } from './person-month.ts';
import { splitMonthByRates } from './rate-schedule.ts';
import {
  displayDecimals,
  formatUnit,
  fromUnit,
  GRID_UNITS,
  type MonthBasis,
  toUnit,
} from './units.ts';

const MARCH_2026 = yearMonth(2026, 3);

const OKAFOR_SLICES = splitMonthByRates(
  [
    { validFrom: parseCalendarDay('2025-01-01'), hourlyCost: 80 },
    { validFrom: parseCalendarDay('2026-03-12'), hourlyCost: 95 },
  ],
  MARCH_2026,
);

/**
 * A. Okafor's March 2026, built from the domain rather than hand-typed, so the
 * two numbers here are the same ones the rate owner would publish.
 */
const OKAFOR_MARCH: MonthBasis = {
  personMonthHours: personMonthHours(40, MARCH_2026),
  blendedHourlyRate: blendedHourlyRate(OKAFOR_SLICES, MARCH_2026),
};

/** The same month on a 32 h/week contract: a 140.8 hour person-month. */
const PART_TIME_MARCH: MonthBasis = {
  personMonthHours: personMonthHours(32, MARCH_2026),
  blendedHourlyRate: OKAFOR_MARCH.blendedHourlyRate,
};

const UNPRICED_MARCH: MonthBasis = {
  personMonthHours: personMonthHours(40, MARCH_2026),
  blendedHourlyRate: 0,
};

describe('the reference cell in all four units', () => {
  it('reads 0.50 person-months as 88 hours', () => {
    expect(fromUnit(0.5, 'personMonths', OKAFOR_MARCH)).toBe(88);
  });

  it('shows 88 hours as 88.00 hours', () => {
    expect(formatUnit(toUnit(88, 'hours', OKAFOR_MARCH), 'hours')).toBe('88.00');
  });

  it('shows 88 hours as 0.50 person-months', () => {
    expect(toUnit(88, 'personMonths', OKAFOR_MARCH)).toBe(0.5);
    expect(formatUnit(toUnit(88, 'personMonths', OKAFOR_MARCH), 'personMonths')).toBe('0.50');
  });

  it('shows 88 hours as 50.0% of capacity', () => {
    expect(toUnit(88, 'percent', OKAFOR_MARCH)).toBe(50);
    expect(formatUnit(toUnit(88, 'percent', OKAFOR_MARCH), 'percent')).toBe('50.0');
  });

  it('shows 88 hours as 7880.00 in cost', () => {
    expect(toUnit(88, 'cost', OKAFOR_MARCH)).toBe(7880);
    expect(formatUnit(toUnit(88, 'cost', OKAFOR_MARCH), 'cost')).toBe('7880.00');
  });
});

describe('the blended rate is a faithful shortcut for the cost rule', () => {
  it('agrees with pricing the month slice by slice', () => {
    // `allocationCost` is the direct expression of rule R1: working days before
    // the change at the old rate, days from it at the new one. Multiplying by
    // the blended rate is the short way round, and this is the check that the
    // two do not disagree.
    for (const hours of [88, 44, 17.5, 1, 0]) {
      expect(toUnit(hours, 'cost', OKAFOR_MARCH)).toBeCloseTo(
        allocationCost(hours, OKAFOR_SLICES, MARCH_2026),
        8,
      );
    }
  });

  it('is exact on the reference numbers', () => {
    expect(toUnit(88, 'cost', OKAFOR_MARCH)).toBe(allocationCost(88, OKAFOR_SLICES, MARCH_2026));
  });
});

describe('switching units and switching back', () => {
  it('leaves the stored value alone, in every unit', () => {
    for (const unit of GRID_UNITS) {
      for (const hours of [88, 44, 17.5, 140.8, 1, 0]) {
        expect(fromUnit(toUnit(hours, unit, OKAFOR_MARCH), unit, OKAFOR_MARCH)).toBeCloseTo(
          hours,
          10,
        );
      }
    }
  });

  it('leaves it alone for a part-time contract too', () => {
    for (const unit of GRID_UNITS) {
      expect(fromUnit(toUnit(70.4, unit, PART_TIME_MARCH), unit, PART_TIME_MARCH)).toBeCloseTo(
        70.4,
        10,
      );
    }
  });
});

describe('the display value is lossy, which is why switching units must not write', () => {
  it('does not survive a round trip through the formatted string', () => {
    const stored = 88.4;

    const shown = formatUnit(toUnit(stored, 'percent', OKAFOR_MARCH), 'percent');
    const reparsed = fromUnit(Number(shown), 'percent', OKAFOR_MARCH);

    expect(shown).toBe('50.2');
    expect(reparsed).not.toBe(stored);
    expect(reparsed).toBeCloseTo(88.352, 10);
  });

  it('is exact through the unrounded value', () => {
    const exact = toUnit(88.4, 'percent', OKAFOR_MARCH);

    expect(fromUnit(exact, 'percent', OKAFOR_MARCH)).toBeCloseTo(88.4, 10);
  });
});

describe('the person-month is part of the conversion', () => {
  it('gives a 32 h/week person-month of 140.8 hours', () => {
    expect(fromUnit(1, 'personMonths', PART_TIME_MARCH)).toBeCloseTo(140.8, 10);
  });

  it('reads the same hours as different percentages for different contracts', () => {
    expect(toUnit(88, 'percent', OKAFOR_MARCH)).toBe(50);
    expect(toUnit(88, 'percent', PART_TIME_MARCH)).toBeCloseTo(62.5, 10);
  });
});

describe('a month with no priced working day', () => {
  it('costs nothing', () => {
    expect(toUnit(88, 'cost', UNPRICED_MARCH)).toBe(0);
  });

  it('still converts the units that do not need a rate', () => {
    expect(toUnit(88, 'personMonths', UNPRICED_MARCH)).toBe(0.5);
    expect(toUnit(88, 'percent', UNPRICED_MARCH)).toBe(50);
  });

  it('refuses an edit typed in cost', () => {
    expect(() => fromUnit(1000, 'cost', UNPRICED_MARCH)).toThrow(RangeError);
  });
});

describe('display precision is fixed by the specification', () => {
  it('uses 2 decimals for hours, person-months and cost, and 1 for percent', () => {
    expect(formatUnit(1 / 3, 'hours')).toBe('0.33');
    expect(formatUnit(1 / 3, 'personMonths')).toBe('0.33');
    expect(formatUnit(1 / 3, 'percent')).toBe('0.3');
    expect(formatUnit(1 / 3, 'cost')).toBe('0.33');
  });

  it('reports the same precision for rounding a set of cells together', () => {
    expect(displayDecimals('hours')).toBe(2);
    expect(displayDecimals('personMonths')).toBe(2);
    expect(displayDecimals('percent')).toBe(1);
    expect(displayDecimals('cost')).toBe(2);
  });
});

describe('rejected input', () => {
  it('refuses a negative or non-finite value in any unit', () => {
    for (const unit of GRID_UNITS) {
      expect(() => toUnit(-1, unit, OKAFOR_MARCH)).toThrow(RangeError);
      expect(() => fromUnit(-1, unit, OKAFOR_MARCH)).toThrow(RangeError);
      expect(() => toUnit(Number.NaN, unit, OKAFOR_MARCH)).toThrow(RangeError);
    }
  });

  it('refuses a basis that cannot describe a month', () => {
    const noMonth: MonthBasis = { personMonthHours: 0, blendedHourlyRate: 80 };
    const negativeRate: MonthBasis = { personMonthHours: 176, blendedHourlyRate: -1 };

    expect(() => toUnit(88, 'hours', noMonth)).toThrow(/person-month/);
    expect(() => toUnit(88, 'hours', negativeRate)).toThrow(/blended rate/);
  });
});
