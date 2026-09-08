import { describe, expect, it } from 'vitest';

import { parseCalendarDay, yearMonth } from './calendar.ts';
import { splitMonthByRates } from './rate-schedule.ts';
import { type EmployeeMonth, formatUnit, fromUnit, GRID_UNITS, toUnit } from './units.ts';

const MARCH_2026 = yearMonth(2026, 3);

const OKAFOR_SLICES = splitMonthByRates(
  [
    { validFrom: parseCalendarDay('2025-01-01'), hourlyCost: 80 },
    { validFrom: parseCalendarDay('2026-03-12'), hourlyCost: 95 },
  ],
  MARCH_2026,
);

/** A. Okafor: 40 h/week, March 2026, rates 80 then 95 from the 12th. */
const OKAFOR_MARCH: EmployeeMonth = {
  month: MARCH_2026,
  weeklyHours: 40,
  rateSlices: OKAFOR_SLICES,
};

/** The same month for a 32 h/week contract, so the person-month is 140.8 h. */
const PART_TIME_MARCH: EmployeeMonth = {
  month: MARCH_2026,
  weeklyHours: 32,
  rateSlices: OKAFOR_SLICES,
};

const UNPRICED_MARCH: EmployeeMonth = {
  month: MARCH_2026,
  weeklyHours: 40,
  rateSlices: [{ kind: 'unpriced', workingDays: 22 }],
};

describe('the reference cell in all four units', () => {
  it('reads 0.50 person-months as 88 hours', () => {
    expect(fromUnit(0.5, 'personMonths', OKAFOR_MARCH)).toBe(88);
  });

  it('shows 88 hours as 88.00 hours', () => {
    expect(toUnit(88, 'hours', OKAFOR_MARCH)).toBe(88);
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

describe('switching units and switching back', () => {
  it('leaves the stored value alone, in every unit', () => {
    for (const unit of GRID_UNITS) {
      for (const hours of [88, 44, 17.5, 140.8, 1, 0]) {
        const roundTripped = fromUnit(toUnit(hours, unit, OKAFOR_MARCH), unit, OKAFOR_MARCH);

        expect(roundTripped).toBeCloseTo(hours, 10);
      }
    }
  });

  it('leaves it alone for a part-time contract too', () => {
    for (const unit of GRID_UNITS) {
      const roundTripped = fromUnit(toUnit(70.4, unit, PART_TIME_MARCH), unit, PART_TIME_MARCH);

      expect(roundTripped).toBeCloseTo(70.4, 10);
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
    const stored = 88.4;

    const exact = toUnit(stored, 'percent', OKAFOR_MARCH);

    expect(fromUnit(exact, 'percent', OKAFOR_MARCH)).toBeCloseTo(stored, 10);
  });
});

describe('the contract is part of the conversion', () => {
  it('gives a 32 h/week person-month of 140.8 hours', () => {
    expect(fromUnit(1, 'personMonths', PART_TIME_MARCH)).toBeCloseTo(140.8, 10);
  });

  it('makes half a part-time month 70.4 hours', () => {
    expect(toUnit(70.4, 'percent', PART_TIME_MARCH)).toBeCloseTo(50, 10);
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
});

describe('rejected input', () => {
  it('refuses a negative or non-finite value in any unit', () => {
    for (const unit of GRID_UNITS) {
      expect(() => toUnit(-1, unit, OKAFOR_MARCH)).toThrow(RangeError);
      expect(() => fromUnit(-1, unit, OKAFOR_MARCH)).toThrow(RangeError);
      expect(() => toUnit(Number.NaN, unit, OKAFOR_MARCH)).toThrow(RangeError);
    }
  });
});
