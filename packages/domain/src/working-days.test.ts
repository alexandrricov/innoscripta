import { describe, expect, it } from 'vitest';

import { daysInMonth, parseCalendarDay, parseYearMonth, yearMonth } from './calendar.ts';
import {
  countWorkingDays,
  workingDaysBefore,
  workingDaysFrom,
  workingDaysInMonth,
} from './working-days.ts';

describe('workingDaysInMonth', () => {
  it('counts the 22 working days of March 2026 used by the reference calculation', () => {
    expect(workingDaysInMonth(yearMonth(2026, 3))).toBe(22);
  });

  it('varies month to month, which is why a person-month is not a constant', () => {
    expect(workingDaysInMonth(yearMonth(2026, 2))).toBe(20);
    expect(workingDaysInMonth(yearMonth(2026, 4))).toBe(22);
    expect(workingDaysInMonth(yearMonth(2026, 5))).toBe(21);
    expect(workingDaysInMonth(yearMonth(2026, 12))).toBe(23);
    expect(workingDaysInMonth(yearMonth(2027, 1))).toBe(21);
  });

  it('handles a leap February', () => {
    expect(daysInMonth(yearMonth(2028, 2))).toBe(29);
    expect(workingDaysInMonth(yearMonth(2028, 2))).toBe(21);
  });
});

describe('a mid-month rate change', () => {
  it('splits March 2026 into 8 days before and 14 days from 12 March', () => {
    const boundary = parseCalendarDay('2026-03-12');

    expect(workingDaysBefore(boundary)).toBe(8);
    expect(workingDaysFrom(boundary)).toBe(14);
  });

  it('always splits the month into two complete halves', () => {
    const month = yearMonth(2026, 3);

    for (let day = 1; day <= daysInMonth(month); day += 1) {
      const boundary = { ...month, day };
      const total = workingDaysBefore(boundary) + workingDaysFrom(boundary);

      expect(total).toBe(workingDaysInMonth(month));
    }
  });

  it('gives the boundary day to the new rate, because validFrom is inclusive', () => {
    // 12 March 2026 is a Thursday, so the boundary day is itself a working day.
    const thursday = parseCalendarDay('2026-03-12');
    const wednesday = parseCalendarDay('2026-03-11');

    expect(workingDaysBefore(thursday)).toBe(workingDaysBefore(wednesday) + 1);
  });

  it('prices the whole month at the new rate when the change lands on the 1st', () => {
    const boundary = parseCalendarDay('2026-03-01');

    expect(workingDaysBefore(boundary)).toBe(0);
    expect(workingDaysFrom(boundary)).toBe(22);
  });

  it('prices almost the whole month at the old rate when the change lands on the last day', () => {
    // 31 March 2026 is a Tuesday.
    const boundary = parseCalendarDay('2026-03-31');

    expect(workingDaysBefore(boundary)).toBe(21);
    expect(workingDaysFrom(boundary)).toBe(1);
  });

  it('counts no working day for the boundary itself when the change lands on a weekend', () => {
    // 14 March 2026 is a Saturday, 15 March a Sunday: both split 10 / 12.
    expect(workingDaysBefore(parseCalendarDay('2026-03-14'))).toBe(10);
    expect(workingDaysFrom(parseCalendarDay('2026-03-14'))).toBe(12);
    expect(workingDaysBefore(parseCalendarDay('2026-03-15'))).toBe(10);
    expect(workingDaysFrom(parseCalendarDay('2026-03-15'))).toBe(12);
  });
});

describe('countWorkingDays', () => {
  it('clamps a range that runs past the end of the month', () => {
    expect(countWorkingDays(yearMonth(2026, 3), 1, 999)).toBe(22);
  });

  it('counts nothing for an inverted range, so slicing needs no edge cases', () => {
    expect(countWorkingDays(yearMonth(2026, 3), 12, 11)).toBe(0);
  });

  it('counts a single weekday but not a single weekend day', () => {
    // 2 March 2026 is a Monday, 7 March a Saturday.
    expect(countWorkingDays(yearMonth(2026, 3), 2, 2)).toBe(1);
    expect(countWorkingDays(yearMonth(2026, 3), 7, 7)).toBe(0);
  });
});

describe('parsing the fixture formats', () => {
  it('reads the month shape used by allocations', () => {
    expect(parseYearMonth('2026-03')).toStrictEqual({ year: 2026, month: 3 });
  });

  it('reads the date shape used by rate records', () => {
    expect(parseCalendarDay('2026-03-12')).toStrictEqual({ year: 2026, month: 3, day: 12 });
  });

  it('rejects anything else rather than guessing', () => {
    expect(() => parseYearMonth('2026-3')).toThrow(RangeError);
    expect(() => parseYearMonth('2026-13')).toThrow(RangeError);
    expect(() => parseCalendarDay('2026-02-30')).toThrow(RangeError);
    expect(() => parseCalendarDay('12/03/2026')).toThrow(RangeError);
  });
});
