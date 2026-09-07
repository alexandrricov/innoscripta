import { describe, expect, it } from 'vitest';

import { yearMonth } from './calendar.ts';
import { hoursPerWorkingDay, personMonthHours } from './person-month.ts';

describe('personMonthHours', () => {
  it('produces the 176 hours of the reference calculation', () => {
    // A. Okafor, 40 h/week, March 2026: 40 * 22 / 5.
    expect(personMonthHours(40, yearMonth(2026, 3))).toBe(176);
  });

  it('differs between people in the same month', () => {
    const march = yearMonth(2026, 3);

    expect(personMonthHours(40, march)).toBe(176);
    expect(personMonthHours(32, march)).toBeCloseTo(140.8, 10);
    expect(personMonthHours(20, march)).toBe(88);
  });

  it('differs between months for the same person', () => {
    expect(personMonthHours(40, yearMonth(2026, 2))).toBe(160);
    expect(personMonthHours(40, yearMonth(2026, 3))).toBe(176);
    expect(personMonthHours(40, yearMonth(2026, 5))).toBe(168);
  });

  it('rejects a contract that cannot exist', () => {
    expect(() => personMonthHours(0, yearMonth(2026, 3))).toThrow(RangeError);
    expect(() => personMonthHours(-40, yearMonth(2026, 3))).toThrow(RangeError);
    expect(() => personMonthHours(Number.NaN, yearMonth(2026, 3))).toThrow(RangeError);
  });
});

describe('hoursPerWorkingDay', () => {
  it('produces the 4 hours a day of the reference calculation', () => {
    // 0.50 person-months is 88 hours, spread over 22 working days.
    expect(hoursPerWorkingDay(88, yearMonth(2026, 3))).toBe(4);
  });

  it('spreads a full person-month back to the contracted daily hours', () => {
    const march = yearMonth(2026, 3);
    const fullMonth = personMonthHours(40, march);

    // 40 hours a week over 5 working days is 8 hours a day, in any month.
    expect(hoursPerWorkingDay(fullMonth, march)).toBe(8);
    expect(hoursPerWorkingDay(personMonthHours(40, yearMonth(2026, 2)), yearMonth(2026, 2))).toBe(
      8,
    );
  });
});
