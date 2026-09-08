import { describe, expect, it } from 'vitest';

import { daysInMonth, parseCalendarDay, yearMonth } from './calendar.ts';
import { type RateRecord, splitMonthByRates } from './rate-schedule.ts';
import { workingDaysInMonth } from './working-days.ts';

const MARCH_2026 = yearMonth(2026, 3);

function rate(validFrom: string, hourlyCost: number): RateRecord {
  return { validFrom: parseCalendarDay(validFrom), hourlyCost };
}

/** A. Okafor's history from the reference calculation. */
const OKAFOR_RATES: readonly RateRecord[] = [rate('2025-01-01', 80), rate('2026-03-12', 95)];

describe('splitMonthByRates', () => {
  it('splits the reference month into 8 days at 80 and 14 days at 95', () => {
    expect(splitMonthByRates(OKAFOR_RATES, MARCH_2026)).toStrictEqual([
      { kind: 'priced', workingDays: 8, hourlyCost: 80 },
      { kind: 'priced', workingDays: 14, hourlyCost: 95 },
    ]);
  });

  it('returns a single slice for a month with no change in it', () => {
    expect(splitMonthByRates(OKAFOR_RATES, yearMonth(2026, 4))).toStrictEqual([
      { kind: 'priced', workingDays: 22, hourlyCost: 95 },
    ]);
  });

  it('returns one slice per rate when several changes land in one month', () => {
    const rates = [
      rate('2025-01-01', 80),
      rate('2026-03-05', 85),
      rate('2026-03-12', 95),
      rate('2026-03-20', 100),
    ];

    expect(splitMonthByRates(rates, MARCH_2026)).toStrictEqual([
      { kind: 'priced', workingDays: 3, hourlyCost: 80 },
      { kind: 'priced', workingDays: 5, hourlyCost: 85 },
      { kind: 'priced', workingDays: 6, hourlyCost: 95 },
      { kind: 'priced', workingDays: 8, hourlyCost: 100 },
    ]);
  });

  it('sorts a history that arrives out of order', () => {
    const shuffled = [rate('2026-03-12', 95), rate('2025-01-01', 80)];

    expect(splitMonthByRates(shuffled, MARCH_2026)).toStrictEqual(
      splitMonthByRates(OKAFOR_RATES, MARCH_2026),
    );
  });
});

describe('a change landing on an edge of the month', () => {
  it('prices the whole month at the new rate when the change is on the 1st', () => {
    const rates = [rate('2025-01-01', 80), rate('2026-03-01', 95)];

    expect(splitMonthByRates(rates, MARCH_2026)).toStrictEqual([
      { kind: 'priced', workingDays: 22, hourlyCost: 95 },
    ]);
  });

  it('drops the run before a change that only covers non-working days', () => {
    // 1 March 2026 is a Sunday, so a change effective Monday the 2nd leaves the
    // old rate with nothing to price.
    const rates = [rate('2025-01-01', 80), rate('2026-03-02', 95)];

    expect(splitMonthByRates(rates, MARCH_2026)).toStrictEqual([
      { kind: 'priced', workingDays: 22, hourlyCost: 95 },
    ]);
  });

  it('leaves the old rate a single working day when the change is on the last day', () => {
    // 31 March 2026 is a Tuesday.
    const rates = [rate('2025-01-01', 80), rate('2026-03-31', 95)];

    expect(splitMonthByRates(rates, MARCH_2026)).toStrictEqual([
      { kind: 'priced', workingDays: 21, hourlyCost: 80 },
      { kind: 'priced', workingDays: 1, hourlyCost: 95 },
    ]);
  });

  it('lets the later record win when two share a validFrom', () => {
    const rates = [rate('2025-01-01', 80), rate('2026-03-12', 95), rate('2026-03-12', 100)];

    expect(splitMonthByRates(rates, MARCH_2026)).toStrictEqual([
      { kind: 'priced', workingDays: 8, hourlyCost: 80 },
      { kind: 'priced', workingDays: 14, hourlyCost: 100 },
    ]);
  });
});

describe('a month with no rate behind it', () => {
  it('reports the whole month as unpriced when it precedes the first rate', () => {
    const rates = [rate('2026-05-01', 80)];

    expect(splitMonthByRates(rates, MARCH_2026)).toStrictEqual([
      { kind: 'unpriced', workingDays: 22 },
    ]);
  });

  it('reports an unpriced run before a first rate that starts mid-month', () => {
    const rates = [rate('2026-03-12', 95)];

    expect(splitMonthByRates(rates, MARCH_2026)).toStrictEqual([
      { kind: 'unpriced', workingDays: 8 },
      { kind: 'priced', workingDays: 14, hourlyCost: 95 },
    ]);
  });

  it('reports an empty history as one unpriced month', () => {
    expect(splitMonthByRates([], MARCH_2026)).toStrictEqual([
      { kind: 'unpriced', workingDays: 22 },
    ]);
  });
});

describe('the invariant the cost of a month rests on', () => {
  it('always accounts for every working day of the month, wherever the change lands', () => {
    const total = workingDaysInMonth(MARCH_2026);

    for (let day = 1; day <= daysInMonth(MARCH_2026); day += 1) {
      const rates = [rate('2025-01-01', 80), { validFrom: { ...MARCH_2026, day }, hourlyCost: 95 }];
      const slices = splitMonthByRates(rates, MARCH_2026);
      const accounted = slices.reduce((sum, slice) => sum + slice.workingDays, 0);

      expect(accounted).toBe(total);
    }
  });

  it('never returns a slice without a working day in it', () => {
    for (let day = 1; day <= daysInMonth(MARCH_2026); day += 1) {
      const rates = [rate('2025-01-01', 80), { validFrom: { ...MARCH_2026, day }, hourlyCost: 95 }];

      for (const slice of splitMonthByRates(rates, MARCH_2026)) {
        expect(slice.workingDays).toBeGreaterThan(0);
      }
    }
  });
});

describe('rejected input', () => {
  it('refuses a cost that cannot be money', () => {
    expect(() => splitMonthByRates([rate('2025-01-01', -1)], MARCH_2026)).toThrow(RangeError);
    expect(() => splitMonthByRates([rate('2025-01-01', Number.NaN)], MARCH_2026)).toThrow(
      RangeError,
    );
  });
});
