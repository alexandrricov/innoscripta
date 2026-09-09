import { describe, expect, it } from 'vitest';

import { formatYearMonth, monthsBetween, nextMonth, yearMonth } from './calendar.ts';

describe('nextMonth', () => {
  it('steps within a year', () => {
    expect(nextMonth(yearMonth(2026, 3))).toStrictEqual({ year: 2026, month: 4 });
  });

  it('rolls the year over in December', () => {
    expect(nextMonth(yearMonth(2026, 12))).toStrictEqual({ year: 2027, month: 1 });
  });
});

describe('monthsBetween', () => {
  it('expands the fixture horizon into twelve columns', () => {
    const horizon = monthsBetween(yearMonth(2026, 4), yearMonth(2027, 3));

    expect(horizon).toHaveLength(12);
    expect(formatYearMonth(horizon[0] ?? yearMonth(1, 1))).toBe('2026-04');
    expect(formatYearMonth(horizon[11] ?? yearMonth(1, 1))).toBe('2027-03');
  });

  it('includes both endpoints', () => {
    expect(
      monthsBetween(yearMonth(2026, 3), yearMonth(2026, 3)).map(formatYearMonth),
    ).toStrictEqual(['2026-03']);
  });

  it('crosses a year boundary in order', () => {
    expect(
      monthsBetween(yearMonth(2026, 11), yearMonth(2027, 2)).map(formatYearMonth),
    ).toStrictEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('yields nothing for an inverted range rather than throwing', () => {
    // A bad configuration should leave the grid without columns, not take the
    // page down.
    expect(monthsBetween(yearMonth(2027, 3), yearMonth(2026, 4))).toStrictEqual([]);
  });
});
